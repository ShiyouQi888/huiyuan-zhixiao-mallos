import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessException } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';

export interface LotUsage {
  lotId: bigint;
  amount: bigint;
  expireAt: Date;
}

/** 权益值：批次（lot）模型 + FIFO 扣减 + 转让继承最早到期日 */
@Injectable()
export class EquityService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensure(userId: bigint, tx: Prisma.TransactionClient = this.prisma) {
    return tx.equityAccount.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  /** 账户余额与批次明细 */
  async getAccount(userId: bigint) {
    const account = await this.ensure(userId);
    const lots = await this.prisma.equityLot.findMany({
      where: { userId, status: 'ACTIVE', remaining: { gt: 0n } },
      orderBy: { expireAt: 'asc' },
      select: { id: true, amount: true, remaining: true, expireAt: true, sourceType: true, createdAt: true },
    });
    return { ...account, lots };
  }

  /** 发放权益值：礼包购买、升级补差、转入 */
  async grant(
    userId: bigint,
    amount: bigint,
    sourceType: 'GRANT' | 'TRANSFER_IN' | 'UPGRADE',
    sourceId: string,
    expireAt: Date,
    bizType = 'equity_grant',
    transaction?: Prisma.TransactionClient,
  ): Promise<{ lotId: bigint; expireAt: Date }> {
    if (amount <= 0n) throw new BusinessException(1003, '发放数量必须大于 0');
    const apply = async (tx: Prisma.TransactionClient) => {
      const dup = await tx.equityTransaction.findFirst({ where: { bizType, bizId: sourceId, type: 1 } });
      if (dup?.lotId) return { lotId: dup.lotId, expireAt };

      const lot = await tx.equityLot.create({
        data: { userId, amount, remaining: amount, expireAt, status: 'ACTIVE', sourceType, sourceId },
      });
      const acc = await this.ensure(userId, tx);
      const balanceAfter = acc.balance + amount;
      const updated = await tx.equityAccount.updateMany({
        where: { userId, version: acc.version },
        data: {
          balance: balanceAfter,
          totalGranted: { increment: amount },
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new BusinessException(3002, '权益值并发冲突，请重试');

      await tx.equityTransaction.create({
        data: { userId, type: 1, changeAmount: amount, balanceAfter, lotId: lot.id, bizType, bizId: sourceId },
      });
      return { lotId: lot.id, expireAt: lot.expireAt };
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  /** FIFO 扣减：按到期日升序消耗批次，返回实际使用的批次（供转让继承到期日） */
  async deductFIFO(
    userId: bigint,
    amount: bigint,
    bizType: string,
    bizId: string,
    type = 2,
    transaction?: Prisma.TransactionClient,
  ): Promise<LotUsage[]> {
    if (amount <= 0n) return [];
    const apply = async (tx: Prisma.TransactionClient) => {
      const dupRows = await tx.equityTransaction.findMany({ where: { bizType, bizId, type } });
      if (dupRows.length) {
        const lotIds = dupRows.map((r) => r.lotId).filter((id): id is bigint => id !== null);
        const lots = await tx.equityLot.findMany({ where: { id: { in: lotIds } } });
        const lotMap = new Map(lots.map((l) => [l.id, l]));
        return dupRows
          .filter((r) => r.lotId !== null)
          .map((r) => ({
            lotId: r.lotId as bigint,
            amount: -r.changeAmount,
            expireAt: lotMap.get(r.lotId as bigint)?.expireAt ?? new Date(0),
          }));
      }

      const acc = await this.ensure(userId, tx);
      if (acc.balance < amount) throw new BusinessException(3001, '权益值余额不足');

      const lots = await tx.equityLot.findMany({
        where: { userId, status: 'ACTIVE', remaining: { gt: 0n } },
        orderBy: [{ expireAt: 'asc' }, { id: 'asc' }],
      });

      let need = amount;
      let running = acc.balance - amount;
      const used: LotUsage[] = [];
      for (const lot of lots) {
        if (need <= 0n) break;
        const take = lot.remaining < need ? lot.remaining : need;
        await tx.equityLot.update({ where: { id: lot.id }, data: { remaining: { decrement: take } } });
        running += take;
        await tx.equityTransaction.create({
          data: { userId, type, changeAmount: -take, balanceAfter: running, lotId: lot.id, bizType, bizId },
        });
        used.push({ lotId: lot.id, amount: take, expireAt: lot.expireAt });
        need -= take;
      }
      if (need > 0n) throw new BusinessException(3001, '权益值余额不足');

      const balanceAfter = acc.balance - amount;
      const updated = await tx.equityAccount.updateMany({
        where: { userId, version: acc.version },
        data: {
          balance: balanceAfter,
          totalUsed: { increment: amount },
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw new BusinessException(3002, '权益值并发冲突，请重试');
      return used;
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  /** 权益值转账转出：扣批次但记录原批次，待确认/超时分别处理 */
  async transferOut(
    fromId: bigint,
    toId: bigint,
    amount: bigint,
    transferNo: string,
  ): Promise<{ usages: LotUsage[]; earliestExpireAt: Date }> {
    const usages = await this.deductFIFO(fromId, amount, 'equity_transfer_out', transferNo, 4);
    if (!usages.length) throw new BusinessException(3001, '权益值余额不足');
    // 权益值 = 转账/可转出额度：转出后额度归零即视为用完，标记暂停计酬（等待复消恢复）
    const account = await this.prisma.equityAccount.findUnique({ where: { userId: fromId } });
    if (account && account.balance <= 0n) {
      await this.prisma.user.updateMany({ where: { id: fromId }, data: { equityStatus: 1 } });
    }
    const earliestExpireAt = usages.reduce(
      (min, u) => (u.expireAt < min ? u.expireAt : min),
      usages[0].expireAt,
    );
    return { usages, earliestExpireAt };
  }

  /** 转账确认：受让方新建批次，到期日继承被扣批次中最早的一个 */
  async transferIn(toId: bigint, amount: bigint, expireAt: Date, transferNo: string): Promise<void> {
    await this.grant(toId, amount, 'TRANSFER_IN', transferNo, expireAt, 'equity_transfer_in');
    await this.prisma.equityAccount.update({
      where: { userId: toId },
      data: { totalTransferIn: { increment: amount } },
    });
  }

  /** 转出方累计转出量 */
  async markTransferOut(fromId: bigint, amount: bigint): Promise<void> {
    await this.prisma.equityAccount.update({
      where: { userId: fromId },
      data: { totalTransferOut: { increment: amount } },
    });
  }

  /** 转账超时/拒绝：把冻结的批次还回去（到期日不变，不延长平台负债） */
  async refundTransfer(fromId: bigint, amount: bigint, usages: LotUsage[], transferNo: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const dup = await tx.equityTransaction.findFirst({ where: { bizType: 'equity_transfer_refund', bizId: transferNo } });
      if (dup) return;

      for (const u of usages) {
        await tx.equityLot.create({
          data: {
            userId: fromId,
            amount: u.amount,
            remaining: u.amount,
            expireAt: u.expireAt,
            status: 'ACTIVE',
            sourceType: 'TRANSFER_IN',
            sourceId: transferNo,
          },
        });
      }
      const acc = await this.ensure(fromId, tx);
      const balanceAfter = acc.balance + amount;
      await tx.equityAccount.update({
        where: { userId: fromId },
        data: { balance: balanceAfter, totalTransferOut: { decrement: amount }, version: { increment: 1 } },
      });
      await tx.equityTransaction.create({
        data: { userId: fromId, type: 5, changeAmount: amount, balanceAfter, bizType: 'equity_transfer_refund', bizId: transferNo },
      });
      // 额度随退款恢复：若此前因「额度用完」被标记暂停计酬，此处解除（暂停只由额度耗尽触发）
      if (balanceAfter > 0n) {
        await tx.user.updateMany({ where: { id: fromId, equityStatus: 1 }, data: { equityStatus: 0 } });
      }
    });
  }

  /** 过期扫描：把已过期批次的剩余量归零并记账 */
  async expireLots(now = new Date()): Promise<number> {
    const expired = await this.prisma.equityLot.findMany({
      where: { status: 'ACTIVE', expireAt: { lte: now }, remaining: { gt: 0n } },
    });
    let count = 0;
    for (const lot of expired) {
      const amount = lot.remaining;
      await this.prisma.$transaction(async (tx) => {
        await tx.equityLot.update({ where: { id: lot.id }, data: { status: 'EXPIRED', remaining: 0n } });
        const acc = await this.ensure(lot.userId, tx);
        const balanceAfter = acc.balance - amount;
        await tx.equityAccount.update({
          where: { userId: lot.userId },
          data: { balance: balanceAfter, totalExpired: { increment: amount }, version: { increment: 1 } },
        });
        await tx.equityTransaction.create({
          data: {
            userId: lot.userId,
            type: 3,
            changeAmount: -amount,
            balanceAfter,
            lotId: lot.id,
            bizType: 'equity_expire',
            bizId: lot.id.toString(),
          },
        });
      });
      count++;
    }
    return count;
  }

  /** 权益值余额为 0 的会员（含全部过期），用于暂停计酬扫描 */
  async pendingSuspendUsers(): Promise<bigint[]> {
    const accounts = await this.prisma.equityAccount.findMany({
      where: { balance: 0n },
      select: { userId: true },
    });
    return accounts.map((a) => a.userId);
  }

  /** 只对已购买礼包的会员生效；普通用户不参与计酬状态机 */
  async setEquityStatus(userId: bigint, status: 0 | 1): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: userId, packageId: { not: null } },
      data: { equityStatus: status },
    });
  }

  async transactions(userId: bigint, page = 1, pageSize = 20) {
    const [list, total] = await Promise.all([
      this.prisma.equityTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.equityTransaction.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize };
  }
}
