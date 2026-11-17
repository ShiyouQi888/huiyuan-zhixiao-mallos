import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { BusinessException, Err } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { EquityService } from '../equity/equity.service';
import { FeaturesService } from '../features/features.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../token/token.service';
import { WalletService } from '../wallet/wallet.service';
import { UserService } from '../user/user.service';
import { TransferQuotaService } from '../transfer-quota/transfer-quota.service';
import { idempotencyScene, requireIdempotencyKey } from '../common/idempotency';

/** 会员间转账：钱包余额（需接收方 24h 内确认）与太阳值（即时到账） */
@Injectable()
export class TransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly equity: EquityService,
    private readonly token: TokenService,
    private readonly features: FeaturesService,
    private readonly config: ConfigService,
    private readonly users: UserService,
    private readonly transferQuota: TransferQuotaService,
  ) {}

  private async parties(fromId: bigint, toPhone: string) {
    if (!/^1[3-9]\d{9}$/.test(toPhone ?? '')) throw Err.param('收款人手机号格式不正确');
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
    scene: 'wallet' | 'equity' | 'token',
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
    const pairWhere = { fromUserId: from.id, toUserId: to.id, createdAt: { gte: weekAgo } };
    const inWhere = { toUserId: to.id, createdAt: { gte: dayAgo } };
    let pairCount = 0;
    let inCount = 0;
    if (scene === 'wallet') {
      [pairCount, inCount] = await Promise.all([
        this.prisma.walletTransfer.count({ where: pairWhere }),
        this.prisma.walletTransfer.count({ where: inWhere }),
      ]);
    } else if (scene === 'equity') {
      [pairCount, inCount] = await Promise.all([
        this.prisma.equityTransfer.count({ where: pairWhere }),
        this.prisma.equityTransfer.count({ where: inWhere }),
      ]);
    } else {
      [pairCount, inCount] = await Promise.all([
        this.prisma.tokenTransfer.count({ where: pairWhere }),
        this.prisma.tokenTransfer.count({ where: inWhere }),
      ]);
    }
    if (pairCount >= 3) score += 40;
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

  private async checkAmount(amount: bigint, scene: 'wallet' | 'equity' | 'token' = 'wallet'): Promise<void> {
    if (amount <= 0n) throw Err.param('转账金额必须大于 0');
    if (scene === 'token') {
      const limit = BigInt(await this.config.getNumber('token.transfer_limit', 0));
      if (limit > 0n && amount > limit) throw Err.param(`单笔转账不得超过 ${limit}`);
      if (!(await this.config.get<boolean>('token.transfer_enabled', true))) throw Err.featureDisabled('太阳值转账功能已关闭');
      return;
    }
    const limit = BigInt(await this.config.getNumber('transfer.limit', 0));
    if (limit > 0n && amount > limit) throw Err.param(`单笔转账不得超过 ${limit} 元`);
    if (!(await this.config.get<boolean>('transfer.enabled', true))) throw Err.featureDisabled('转账功能已关闭');
  }

  private normalizeRemark(remark?: string): string | undefined {
    if (remark === undefined) return undefined;
    if (typeof remark !== 'string') throw Err.param('转账备注格式不正确');
    const normalized = remark.trim();
    if (normalized.length > 255) throw Err.param('转账备注不能超过 255 个字符');
    return normalized || undefined;
  }

  /* ---------------- 钱包余额转账 ---------------- */

  async createWalletTransfer(fromId: bigint, toPhone: string, amount: bigint, paymentPassword: string, remark?: string, platform: 'h5' | 'app' = 'h5', rankLevel = 0, rawIdempotencyKey?: string) {
    await this.features.assertEnabled('wallet.transfer', platform, rankLevel);
    remark = this.normalizeRemark(remark);
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    const scene = idempotencyScene('wallet.transfer', { fromId, toPhone, amount, remark });
    await this.users.verifyTransferPassword(fromId, paymentPassword);
    await this.checkAmount(amount);
    const { from, to } = await this.parties(fromId, toPhone);
    const riskFlag = await this.checkRisk(from, to, amount, 'wallet');

    const transferNo = `W${randomUUID().replace(/-/g, '').slice(0, 31).toUpperCase()}`;
    const run = async (tx: Prisma.TransactionClient) => {
      const previous = await tx.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (previous && previous.expireAt > new Date()) {
        if (previous.scene !== scene) throw Err.conflict('该请求幂等键已用于其他转账内容，请重新提交');
        const transferNo = (previous.result as { transferNo?: string } | null)?.transferNo;
        if (!transferNo) throw Err.conflict('转账请求正在处理中，请稍后刷新流水');
        const priorTransfer = await tx.walletTransfer.findUniqueOrThrow({ where: { transferNo } });
        return { transferNo: priorTransfer.transferNo, status: priorTransfer.status, riskFlag: priorTransfer.riskFlag };
      }
      if (previous) await tx.idempotencyKey.delete({ where: { key: idempotencyKey } });
      await tx.idempotencyKey.create({ data: { key: idempotencyKey, scene, expireAt: new Date(Date.now() + 86400_000) } });
      await this.wallet.freeze(fromId, amount, transferNo, tx);
      await this.transferQuota.reserve(fromId, amount, transferNo, tx);
      const transfer = await tx.walletTransfer.create({
        data: { transferNo, fromUserId: fromId, toUserId: to.id, amount, riskFlag, remark },
      });
      await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { result: { transferNo: transfer.transferNo } } });
      return { transferNo: transfer.transferNo, status: transfer.status, riskFlag };
    };
    try {
      return await this.prisma.$transaction(run);
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const previous = await this.prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (!previous || previous.scene !== scene) throw error;
      const priorNo = (previous.result as { transferNo?: string } | null)?.transferNo;
      if (!priorNo) throw Err.conflict('转账请求正在处理中，请稍后刷新流水');
      const priorTransfer = await this.prisma.walletTransfer.findUniqueOrThrow({ where: { transferNo: priorNo } });
      return { transferNo: priorTransfer.transferNo, status: priorTransfer.status, riskFlag: priorTransfer.riskFlag };
    }
  }

  async acceptWalletTransfer(transferId: bigint, userId: bigint, reviewedByAdmin = false) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.walletTransfer.findUnique({ where: { id: transferId } });
      if (!t) throw Err.notFound('转账记录不存在');
      if (t.toUserId !== userId) throw Err.forbidden('只有接收方可以确认');
      if (t.status !== 'PENDING') throw Err.conflict('该转账已处理');
      if (t.riskFlag === 1 && !reviewedByAdmin) throw Err.risk('该转账正在人工审核中');
      const marked = await tx.walletTransfer.updateMany({
        where: { id: t.id, status: 'PENDING' }, data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (!marked.count) throw Err.conflict('该转账已处理');
      await this.wallet.confirmTransfer(t.fromUserId, t.toUserId, t.amount, t.transferNo, tx);
      await this.transferQuota.consumeReserved(t.fromUserId, t.amount, t.transferNo, tx);
      return tx.walletTransfer.findUniqueOrThrow({ where: { id: t.id } });
    });
  }

  /* ---------------- 权益值转账 ---------------- */

  async createEquityTransfer(fromId: bigint, toPhone: string, amount: bigint, paymentPassword: string, remark?: string, platform: 'h5' | 'app' = 'h5', rankLevel = 0, _rawIdempotencyKey?: string) {
    await this.features.assertEnabled('equity.transfer', platform, rankLevel);
    remark = this.normalizeRemark(remark);
    await this.users.verifyTransferPassword(fromId, paymentPassword);
    await this.checkAmount(amount);
    const { from, to } = await this.parties(fromId, toPhone);
    const riskFlag = await this.checkRisk(from, to, amount, 'equity');

    const transferNo = `E${randomUUID().replace(/-/g, '').slice(0, 31).toUpperCase()}`;
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

  /* ---------------- 太阳值转账（即时到账） ---------------- */

  async createTokenTransfer(fromId: bigint, toPhone: string, amount: bigint, paymentPassword: string, remark?: string, platform: 'h5' | 'app' = 'h5', rankLevel = 0, rawIdempotencyKey?: string) {
    await this.features.assertEnabled('token.transfer', platform, rankLevel);
    remark = this.normalizeRemark(remark);
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    const scene = idempotencyScene('token.transfer', { fromId, toPhone, amount, remark });
    await this.users.verifyTransferPassword(fromId, paymentPassword);
    await this.checkAmount(amount, 'token');
    const { from, to } = await this.parties(fromId, toPhone);
    const riskFlag = await this.checkRisk(from, to, amount, 'token');

    const transferNo = `T${randomUUID().replace(/-/g, '').slice(0, 31).toUpperCase()}`;
    const run = async (tx: Prisma.TransactionClient) => {
      const previous = await tx.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (previous && previous.expireAt > new Date()) {
        if (previous.scene !== scene) throw Err.conflict('该请求幂等键已用于其他转账内容，请重新提交');
        const priorNo = (previous.result as { transferNo?: string } | null)?.transferNo;
        if (!priorNo) throw Err.conflict('转账请求正在处理中，请稍后刷新流水');
        const priorTransfer = await tx.tokenTransfer.findUniqueOrThrow({ where: { transferNo: priorNo } });
        return { transferNo: priorTransfer.transferNo, status: priorTransfer.status, riskFlag: priorTransfer.riskFlag };
      }
      if (previous) await tx.idempotencyKey.delete({ where: { key: idempotencyKey } });
      await tx.idempotencyKey.create({ data: { key: idempotencyKey, scene, expireAt: new Date(Date.now() + 86400_000) } });
      await this.token.transfer(fromId, to.id, amount, transferNo, tx);
      const transfer = await tx.tokenTransfer.create({
        data: {
          transferNo, fromUserId: fromId, toUserId: to.id, amount, riskFlag, remark,
          status: 'COMPLETED', completedAt: new Date(),
        },
      });
      await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { result: { transferNo: transfer.transferNo } } });
      return { transferNo: transfer.transferNo, status: transfer.status, riskFlag };
    };
    try {
      return await this.prisma.$transaction(run);
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const previous = await this.prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (!previous || previous.scene !== scene) throw error;
      const priorNo = (previous.result as { transferNo?: string } | null)?.transferNo;
      if (!priorNo) throw Err.conflict('转账请求正在处理中，请稍后刷新流水');
      const priorTransfer = await this.prisma.tokenTransfer.findUniqueOrThrow({ where: { transferNo: priorNo } });
      return { transferNo: priorTransfer.transferNo, status: priorTransfer.status, riskFlag: priorTransfer.riskFlag };
    }
  }

  /** 拒绝转账（转出方或管理员） */
  async rejectWalletTransfer(transferId: bigint, userId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const t = await tx.walletTransfer.findUnique({ where: { id: transferId } });
      if (!t || (t.fromUserId !== userId && t.toUserId !== userId)) throw Err.notFound('转账记录不存在');
      if (t.status !== 'PENDING') throw Err.conflict('该转账已处理');
      const marked = await tx.walletTransfer.updateMany({ where: { id: t.id, status: 'PENDING' }, data: { status: 'REJECTED' } });
      if (!marked.count) throw Err.conflict('该转账已处理');
      await this.wallet.unfreeze(t.fromUserId, t.amount, t.transferNo, tx);
      await this.transferQuota.release(t.fromUserId, t.amount, t.transferNo, tx);
      return tx.walletTransfer.findUniqueOrThrow({ where: { id: t.id } });
    });
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
      const expired = await this.prisma.$transaction(async (tx) => {
        const marked = await tx.walletTransfer.updateMany({ where: { id: t.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
        if (!marked.count) return false;
        await this.wallet.unfreeze(t.fromUserId, t.amount, t.transferNo, tx);
        await this.transferQuota.release(t.fromUserId, t.amount, t.transferNo, tx);
        return true;
      });
      if (expired) count++;
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

  async listTransfers(userId: bigint, platform: 'wallet' | 'equity' | 'token', page = 1, pageSize = 20) {
    const where = { OR: [{ fromUserId: userId }, { toUserId: userId }] };
    const include = {
      fromUser: { select: { id: true, phone: true, nickname: true } },
      toUser: { select: { id: true, phone: true, nickname: true } },
    };
    const take = { orderBy: { createdAt: 'desc' as const }, skip: (page - 1) * pageSize, take: pageSize, include };
    if (platform === 'token') {
      const [list, total] = await Promise.all([
        this.prisma.tokenTransfer.findMany({ where, ...take }),
        this.prisma.tokenTransfer.count({ where }),
      ]);
      return { list, total, page, pageSize };
    }
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
