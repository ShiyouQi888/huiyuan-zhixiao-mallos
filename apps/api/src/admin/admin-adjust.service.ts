import { Injectable } from '@nestjs/common';
import { BusinessException } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

/** 管理端手工调整：所有调整都写流水 + 审计，不直接改余额 */
@Injectable()
export class AdminAdjustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** 钱包余额手工调整（正负均可），写 wallet_transactions 保账 */
  async adjustWallet(userId: bigint, amount: bigint, reason: string, operatorId: bigint) {
    if (amount === 0n) throw new BusinessException(1003, '调整金额不能为 0');
    const bizId = `admin_adj_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
      const balanceAfter = wallet.balance + amount;
      if (balanceAfter < 0n) throw new BusinessException(3001, '调整后余额不能为负');

      const updated = await tx.wallet.updateMany({
        where: { userId, version: wallet.version },
        data: {
          balance: balanceAfter,
          ...(amount > 0n ? { totalIn: { increment: amount } } : { totalOut: { increment: -amount } }),
          version: { increment: 1 },
        },
      });
      if (!updated.count) throw new BusinessException(3002, '钱包并发冲突');

      const txRow = await tx.walletTransaction.create({
        data: {
          userId,
          type: 5,
          changeAmount: amount,
          balanceAfter,
          bizType: 'admin_adjust',
          bizId,
          remark: reason,
        },
      });

      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN',
          operatorId,
          action: 'WALLET_ADJUST',
          targetType: 'USER',
          targetId: userId,
          after: { amount: amount.toString(), reason, balanceAfter: balanceAfter.toString() } as never,
        },
      });
      return txRow;
    });
  }

  /** 权益值手工调整：发放用 grant 批次，扣减走 FIFO */
  async adjustEquity(userId: bigint, amount: bigint, reason: string, operatorId: bigint) {
    if (amount === 0n) throw new BusinessException(1003, '调整数量不能为 0');
    const bizId = `admin_eq_adj_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.equityAccount.upsert({ where: { userId }, create: { userId }, update: {} });
      const balanceAfter = account.balance + amount;
      if (balanceAfter < 0n) throw new BusinessException(3001, '调整后权益值不能为负');

      let lotId: bigint | null = null;
      if (amount > 0n) {
        const expireAt = new Date();
        expireAt.setMonth(expireAt.getMonth() + Number(await this.config.getNumber('equity.expire_months', 12)));
        const lot = await tx.equityLot.create({
          data: { userId, amount, remaining: amount, expireAt, status: 'ACTIVE', sourceType: 'GRANT', sourceId: bizId },
        });
        lotId = lot.id;
      } else {
        // FIFO 扣减：从最早到期批次开始
        const deduct = -amount;
        let remain = deduct;
        const lots = await tx.equityLot.findMany({
          where: { userId, status: 'ACTIVE', remaining: { gt: 0n } },
          orderBy: [{ expireAt: 'asc' }, { id: 'asc' }],
        });
        for (const lot of lots) {
          if (remain <= 0n) break;
          const take = lot.remaining < remain ? lot.remaining : remain;
          await tx.equityLot.update({ where: { id: lot.id }, data: { remaining: { decrement: take } } });
          remain -= take;
        }
        if (remain > 0n) throw new BusinessException(3001, '权益值余额不足');
      }

      const updated = await tx.equityAccount.updateMany({
        where: { userId, version: account.version },
        data: {
          balance: balanceAfter,
          version: { increment: 1 },
          ...(amount > 0n ? { totalGranted: { increment: amount } } : { totalUsed: { increment: -amount } }),
        },
      });
      if (!updated.count) throw new BusinessException(3002, '权益值并发冲突');

      await tx.equityTransaction.create({
        data: {
          userId,
          type: 6,
          changeAmount: amount,
          balanceAfter,
          lotId,
          bizType: 'admin_adjust',
          bizId,
        },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN',
          operatorId,
          action: 'EQUITY_ADJUST',
          targetType: 'USER',
          targetId: userId,
          after: { amount: amount.toString(), reason, balanceAfter: balanceAfter.toString() } as never,
        },
      });
      return { userId, amount, balanceAfter };
    });
  }

  /** 奖金手工调整：走 bonus_record 记账 + 钱包入账 */
  async adjustBonus(userId: bigint, amount: bigint, reason: string, operatorId: bigint) {
    if (amount <= 0n) throw new BusinessException(1003, '调整金额必须大于 0');
    const now = new Date();
    const bizId = `admin_bonus_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
      const balanceAfter = wallet.balance + amount;
      await tx.wallet.updateMany({
        where: { userId, version: wallet.version },
        data: { balance: balanceAfter, totalIn: { increment: amount }, version: { increment: 1 } },
      });
      await tx.walletTransaction.create({
        data: { userId, type: 5, changeAmount: amount, balanceAfter, bizType: 'admin_bonus_adjust', bizId, remark: reason },
      });
      const record = await tx.bonusRecord.create({
        data: {
          userId,
          type: 6,
          amount,
          cashAmount: amount,
          tokenAmount: 0n,
          settleDate: now,
        },
      });
      await tx.auditLog.create({
        data: {
          operatorType: 'ADMIN',
          operatorId,
          action: 'BONUS_ADJUST',
          targetType: 'USER',
          targetId: userId,
          after: { amount: amount.toString(), reason, recordId: record.id.toString() } as never,
        },
      });
      return record;
    });
  }
}
