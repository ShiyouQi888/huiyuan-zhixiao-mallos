import { Injectable } from '@nestjs/common';
import { Prisma, Wallet, WalletTransaction } from '@prisma/client';
import { BusinessException } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/** 现金钱包：余额 + 冻结，乐观锁 + 流水唯一键保幂等 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(userId: bigint, tx: Tx = this.prisma): Promise<Wallet> {
    return tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  async get(userId: bigint, tx: Tx = this.prisma) {
    const wallet = await this.ensure(userId, tx);
    return { ...wallet, available: wallet.balance - wallet.frozen };
  }

  /** 入账（奖金 / 转入 / 调整 / 转账退回）。幂等键 (bizType, bizId) */
  async credit(
    userId: bigint,
    amount: bigint,
    bizType: string,
    bizId: string,
    type = 1,
    remark?: string,
  ): Promise<WalletTransaction | null> {
    if (amount <= 0n) return null;
    return this.prisma.$transaction(async (tx) => {
      const dup = await tx.walletTransaction.findUnique({
        where: { bizType_bizId: { bizType, bizId } },
      });
      if (dup) return dup;

      const acc = await this.ensure(userId, tx);
      const balanceAfter = acc.balance + amount;
      const updated = await tx.wallet.updateMany({
        where: { userId, version: acc.version },
        data: { balance: balanceAfter, totalIn: { increment: amount }, version: { increment: 1 } },
      });
      if (updated.count === 0) throw new BusinessException(3002, '钱包并发冲突，请重试');

      return tx.walletTransaction.create({
        data: { userId, type, changeAmount: amount, balanceAfter, bizType, bizId, remark },
      });
    });
  }

  /** 消费扣减。余额不足抛 3001 */
  async debit(
    userId: bigint,
    amount: bigint,
    bizType: string,
    bizId: string,
    remark?: string,
    transaction?: Tx,
  ): Promise<WalletTransaction | null> {
    if (amount <= 0n) return null;
    const apply = async (tx: Tx) => {
      const dup = await tx.walletTransaction.findUnique({
        where: { bizType_bizId: { bizType, bizId } },
      });
      if (dup) return dup;

      const acc = await this.ensure(userId, tx);
      if (acc.balance - acc.frozen < amount) throw new BusinessException(3001, '钱包可用余额不足');
      const balanceAfter = acc.balance - amount;
      const updated = await tx.wallet.updateMany({
        where: { userId, version: acc.version },
        data: { balance: balanceAfter, totalOut: { increment: amount }, version: { increment: 1 } },
      });
      if (updated.count === 0) throw new BusinessException(3002, '钱包并发冲突，请重试');

      return tx.walletTransaction.create({
        data: { userId, type: 2, changeAmount: -amount, balanceAfter, bizType, bizId, remark },
      });
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  /** 转账发起：balance -= amount，frozen += amount */
  async freeze(userId: bigint, amount: bigint, transferNo: string, transaction?: Tx): Promise<void> {
    const apply = async (tx: Tx) => {
      const acc = await this.ensure(userId, tx);
      if (acc.balance - acc.frozen < amount) throw new BusinessException(3001, '钱包可用余额不足');
      const updated = await tx.wallet.updateMany({
        where: { userId, version: acc.version },
        data: { balance: { decrement: amount }, frozen: { increment: amount }, version: { increment: 1 } },
      });
      if (updated.count === 0) throw new BusinessException(3002, '钱包并发冲突，请重试');

      await tx.walletTransaction.create({
        data: {
          userId,
          type: 3,
          changeAmount: -amount,
          balanceAfter: acc.balance - amount,
          bizType: 'wallet_transfer_freeze',
          bizId: transferNo,
          remark: '转账发起，资金冻结',
        },
      });
    };
    if (transaction) await apply(transaction);
    else await this.prisma.$transaction(apply);
  }

  /** 转账确认：转出方 frozen -= amount，转入方 balance += amount */
  async confirmTransfer(fromId: bigint, toId: bigint, amount: bigint, transferNo: string, transaction?: Tx): Promise<void> {
    const apply = async (tx: Tx) => {
      const from = await this.ensure(fromId, tx);
      const f = await tx.wallet.updateMany({
        where: { userId: fromId, version: from.version },
        data: {
          frozen: { decrement: amount },
          totalTransferOut: { increment: amount },
          version: { increment: 1 },
        },
      });
      if (f.count === 0) throw new BusinessException(3002, '钱包并发冲突，请重试');
      await tx.walletTransaction.create({
        data: { userId: fromId, type: 3, changeAmount: 0n, balanceAfter: from.balance, bizType: 'wallet_transfer_out', bizId: transferNo },
      });

      const to = await this.ensure(toId, tx);
      const t = await tx.wallet.updateMany({
        where: { userId: toId, version: to.version },
        data: {
          balance: { increment: amount },
          totalTransferIn: { increment: amount },
          version: { increment: 1 },
        },
      });
      if (t.count === 0) throw new BusinessException(3002, '钱包并发冲突，请重试');
      await tx.walletTransaction.create({
        data: { userId: toId, type: 4, changeAmount: amount, balanceAfter: to.balance + amount, bizType: 'wallet_transfer_in', bizId: transferNo },
      });
    };
    if (transaction) await apply(transaction);
    else await this.prisma.$transaction(apply);
  }

  /** 超时/拒绝退回：frozen -= amount，balance += amount */
  async unfreeze(userId: bigint, amount: bigint, transferNo: string, transaction?: Tx): Promise<void> {
    const apply = async (tx: Tx) => {
      const acc = await this.ensure(userId, tx);
      const updated = await tx.wallet.updateMany({
        where: { userId, version: acc.version },
        data: { balance: { increment: amount }, frozen: { decrement: amount }, version: { increment: 1 } },
      });
      if (updated.count === 0) throw new BusinessException(3002, '钱包并发冲突，请重试');
      await tx.walletTransaction.create({
        data: { userId, type: 6, changeAmount: amount, balanceAfter: acc.balance + amount, bizType: 'wallet_transfer_refund', bizId: transferNo },
      });
    };
    if (transaction) await apply(transaction);
    else await this.prisma.$transaction(apply);
  }

  async transactions(userId: bigint, page = 1, pageSize = 20) {
    const [list, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.walletTransaction.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize };
  }
}
