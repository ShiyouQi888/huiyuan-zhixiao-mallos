import { Injectable } from '@nestjs/common';
import { BusinessException, Err } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { EquityService } from '../equity/equity.service';
import { FeaturesService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { UserService } from '../user/user.service';

/** 会员间转账：钱包余额 / 权益值，均需接收方 24h 内确认 */
@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly equity: EquityService,
    private readonly features: FeaturesService,
    private readonly config: ConfigService,
    private readonly users: UserService,
  ) {}

  private async parties(fromId: bigint, toPhone: string) {
    const from = await this.prisma.user.findUnique({ where: { id: fromId } });
    const to = await this.prisma.user.findUnique({ where: { phone: toPhone } });
    if (!from || !to) throw Err.notFound('转账双方账号不存在');
    if (from.id === to.id) throw new BusinessException(3003, '不能转账给自己');
    if (from.status !== 0 || to.status !== 0) throw Err.forbidden('账号状态异常，无法转账');
    if (from.realNameStatus !== 1) throw Err.needRealname('转出方需先完成实名认证');
    return { from, to };
  }

  /** 5 条风控规则：同设备拒绝，其余 3 条标记人工审核 */
  private async checkRisk(
    from: { id: bigint; deviceFingerprint: string | null; createdAt: Date },
    to: { id: bigint; deviceFingerprint: string | null },
    amount: bigint,
    scene: 'wallet' | 'equity',
  ): Promise<number> {
    if (from.deviceFingerprint && from.deviceFingerprint === to.deviceFingerprint) {
      await this.prisma.riskEvent.create({
        data: { userId: from.id, eventType: 'SAME_DEVICE_TRANSFER', score: 100, detail: { amount: amount.toString(), scene } as never },
      });
      throw Err.risk('检测到同设备互转，已拒绝');
    }

    let score = 0;
    const weekAgo = new Date(Date.now() - 7 * 86400_000);
    const dayAgo = new Date(Date.now() - 86400_000);
    const countWhere = scene === 'wallet'
      ? { fromUserId: from.id, toUserId: to.id, createdAt: { gte: weekAgo } }
      : { fromUserId: from.id, toUserId: to.id, createdAt: { gte: weekAgo } };
    const pairCount = scene === 'wallet'
      ? await this.prisma.walletTransfer.count({ where: countWhere })
      : await this.prisma.equityTransfer.count({ where: countWhere });
    if (pairCount >= 3) score += 40;

    const inCount = scene === 'wallet'
      ? await this.prisma.walletTransfer.count({ where: { toUserId: to.id, createdAt: { gte: dayAgo } } })
      : await this.prisma.equityTransfer.count({ where: { toUserId: to.id, createdAt: { gte: dayAgo } } });
    if (inCount >= 3) score += 30;

    const ageDays = (Date.now() - from.createdAt.getTime()) / 86400_000;
    if (ageDays < 7 && amount > 5000n) score += 50;

    if (score > 0) {
      await this.prisma.riskEvent.create({
        data: { userId: from.id, eventType: 'TRANSFER_REVIEW', score, detail: { amount: amount.toString(), scene, toUserId: to.id.toString() } as never },
      });
    }
    return score > 0 ? 1 : 0;
  }

  private async checkAmount(amount: bigint): Promise<void> {
    if (amount <= 0n) throw Err.param('转账金额必须大于 0');
    const limit = BigInt(await this.config.getNumber('transfer.limit', 0));
    if (limit > 0n && amount > limit) throw Err.param(`单笔转账不得超过 ${limit} 元`);
    if (!(await this.config.get<boolean>('transfer.enabled', true))) throw Err.featureDisabled('转账功能已关闭');
  }

  /* ---------------- 钱包余额转账 ---------------- */

  async createWalletTransfer(fromId: bigint, toPhone: string, amount: bigint, paymentPassword: string, remark?: string) {
    await this.features.assertEnabled('wallet.transfer');
    await this.users.verifyTransferPassword(fromId, paymentPassword);
    await this.checkAmount(amount);
    const { from, to } = await this.parties(fromId, toPhone);
    const riskFlag = await this.checkRisk(from, to, amount, 'wallet');

    const transferNo = `W${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    await this.wallet.freeze(fromId, amount, transferNo);
    const transfer = await this.prisma.walletTransfer.create({
      data: { transferNo, fromUserId: fromId, toUserId: to.id, amount, riskFlag, remark },
    });
    return { transferNo: transfer.transferNo, status: transfer.status, riskFlag };
  }

  async acceptWalletTransfer(transferId: bigint, userId: bigint, reviewedByAdmin = false) {
    const t = await this.prisma.walletTransfer.findUnique({ where: { id: transferId } });
    if (!t) throw Err.notFound('转账记录不存在');
    if (t.toUserId !== userId) throw Err.forbidden('只有接收方可以确认');
    if (t.status !== 'PENDING') throw Err.conflict('该转账已处理');
    if (t.riskFlag === 1 && !reviewedByAdmin) throw Err.risk('该转账正在人工审核中');

    await this.wallet.confirmTransfer(t.fromUserId, t.toUserId, t.amount, t.transferNo);
    return this.prisma.walletTransfer.update({
      where: { id: t.id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  /* ---------------- 权益值转账 ---------------- */

  async createEquityTransfer(fromId: bigint, toPhone: string, amount: bigint, paymentPassword: string, remark?: string) {
    await this.features.assertEnabled('equity.transfer');
    await this.users.verifyTransferPassword(fromId, paymentPassword);
    await this.checkAmount(amount);
    const { from, to } = await this.parties(fromId, toPhone);
    const riskFlag = await this.checkRisk(from, to, amount, 'equity');

    const transferNo = `E${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
    const { usages, earliestExpireAt } = await this.equity.transferOut(fromId, to.id, amount, transferNo);
    await this.equity.markTransferOut(fromId, amount);

    const transfer = await this.prisma.equityTransfer.create({
      data: {
        transferNo,
        fromUserId: fromId,
        toUserId: to.id,
        amount,
        fromLotIds: usages.map((u) => ({ lotId: u.lotId.toString(), amount: u.amount.toString(), expireAt: u.expireAt.toISOString() })) as never,
        riskFlag,
        remark,
      },
    });
    return { transferNo: transfer.transferNo, status: transfer.status, riskFlag, earliestExpireAt };
  }

  async acceptEquityTransfer(transferId: bigint, userId: bigint, reviewedByAdmin = false) {
    const t = await this.prisma.equityTransfer.findUnique({ where: { id: transferId } });
    if (!t) throw Err.notFound('转账记录不存在');
    if (t.toUserId !== userId) throw Err.forbidden('只有接收方可以确认');
    if (t.status !== 'PENDING') throw Err.conflict('该转账已处理');
    if (t.riskFlag === 1 && !reviewedByAdmin) throw Err.risk('该转账正在人工审核中');

    const usages = t.fromLotIds as Array<{ expireAt: string }>;
    const earliest = usages
      .map((u) => new Date(u.expireAt))
      .reduce((min, d) => (d < min ? d : min), new Date(usages[0]?.expireAt ?? Date.now()));

    await this.equity.transferIn(t.toUserId, t.amount, earliest, t.transferNo);
    await this.prisma.equityTransfer.update({
      where: { id: t.id },
      data: { toLotId: null, status: 'COMPLETED', completedAt: new Date() },
    });
    return { transferNo: t.transferNo, status: 'COMPLETED' };
  }

  /** 拒绝转账（转出方或管理员） */
  async rejectWalletTransfer(transferId: bigint, userId: bigint) {
    const t = await this.prisma.walletTransfer.findUnique({ where: { id: transferId } });
    if (!t || (t.fromUserId !== userId && t.toUserId !== userId)) throw Err.notFound('转账记录不存在');
    if (t.status !== 'PENDING') throw Err.conflict('该转账已处理');
    await this.wallet.unfreeze(t.fromUserId, t.amount, t.transferNo);
    return this.prisma.walletTransfer.update({ where: { id: t.id }, data: { status: 'REJECTED' } });
  }

  async rejectEquityTransfer(transferId: bigint, userId: bigint) {
    const t = await this.prisma.equityTransfer.findUnique({ where: { id: transferId } });
    if (!t || (t.fromUserId !== userId && t.toUserId !== userId)) throw Err.notFound('转账记录不存在');
    if (t.status !== 'PENDING') throw Err.conflict('该转账已处理');
    const usages = (t.fromLotIds as Array<{ lotId: string; amount: string; expireAt: string }>).map((u) => ({
      lotId: BigInt(u.lotId),
      amount: BigInt(u.amount),
      expireAt: new Date(u.expireAt),
    }));
    await this.equity.refundTransfer(t.fromUserId, t.amount, usages, t.transferNo);
    return this.prisma.equityTransfer.update({ where: { id: t.id }, data: { status: 'REJECTED' } });
  }

  /** 24h 超时自动退回（定时任务调用） */
  async expirePending() {
    const hours = await this.config.getNumber('transfer.accept_timeout_hours', 24);
    const cutoff = new Date(Date.now() - hours * 3600_000);
    let count = 0;

    const walletPending = await this.prisma.walletTransfer.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
    });
    for (const t of walletPending) {
      await this.wallet.unfreeze(t.fromUserId, t.amount, t.transferNo);
      await this.prisma.walletTransfer.update({ where: { id: t.id }, data: { status: 'EXPIRED' } });
      count++;
    }

    const equityPending = await this.prisma.equityTransfer.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
    });
    for (const t of equityPending) {
      const usages = (t.fromLotIds as Array<{ lotId: string; amount: string; expireAt: string }>).map((u) => ({
        lotId: BigInt(u.lotId),
        amount: BigInt(u.amount),
        expireAt: new Date(u.expireAt),
      }));
      await this.equity.refundTransfer(t.fromUserId, t.amount, usages, t.transferNo);
      await this.prisma.equityTransfer.update({ where: { id: t.id }, data: { status: 'EXPIRED' } });
      count++;
    }
    return count;
  }

  async listTransfers(userId: bigint, platform: 'wallet' | 'equity', page = 1, pageSize = 20) {
    const where = { OR: [{ fromUserId: userId }, { toUserId: userId }] };
    const include = {
      fromUser: { select: { id: true, phone: true, nickname: true } },
      toUser: { select: { id: true, phone: true, nickname: true } },
    };
    const take = { orderBy: { createdAt: 'desc' as const }, skip: (page - 1) * pageSize, take: pageSize, include };
    if (platform === 'wallet') {
      const [list, total] = await Promise.all([
        this.prisma.walletTransfer.findMany({ where, ...take }),
        this.prisma.walletTransfer.count({ where }),
      ]);
      return { list, total, page, pageSize };
    }
    const [list, total] = await Promise.all([
      this.prisma.equityTransfer.findMany({ where, ...take }),
      this.prisma.equityTransfer.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }
}
