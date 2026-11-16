import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessException } from '../common/business.exception';
import { PrismaService } from '../prisma/prisma.service';

/** 数权：奖励记账部分（30%），支持会员间互转（即时到账）；不提现、不消费 */
@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {}

  private ensure(userId: bigint, tx: Prisma.TransactionClient = this.prisma) {
    return tx.tokenAccount.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  /** 发放数权（奖金拆分 30%），按奖金记录幂等 */
  async credit(
    userId: bigint,
    amount: bigint,
    sourceBonusId: bigint | null,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    if (amount <= 0n) return;
    const bizType = 'token_bonus';
    const bizId = sourceBonusId !== null ? `bonus:${sourceBonusId}` : `manual:${userId}:${amount}`;
    const apply = async (tx: Prisma.TransactionClient) => {
      const dup = await tx.tokenTransaction.findUnique({ where: { bizType_bizId: { bizType, bizId } } });
      if (dup) return;

      await tx.tokenLot.create({
        data: { userId, amount, sourceBonusId, sourceType: 'BONUS', sourceId: bizId },
      });
      const acc = await this.ensure(userId, tx);
      const balanceAfter = acc.balance + amount;
      const updated = await tx.tokenAccount.updateMany({
        where: { userId, version: acc.version },
        data: { balance: balanceAfter, totalGranted: { increment: amount }, version: { increment: 1 } },
      });
      if (updated.count === 0) throw new BusinessException(3002, '数权并发冲突，请重试');
      await tx.tokenTransaction.create({
        data: { userId, type: 1, changeAmount: amount, balanceAfter, bizType, bizId },
      });
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  /** 数权互转：即时到账（转出方扣减、接收方入账，双向流水） */
  async transfer(
    fromId: bigint,
    toId: bigint,
    amount: bigint,
    transferNo: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<void> {
    if (amount <= 0n) throw new BusinessException(1003, '转账数量必须大于 0');
    if (fromId === toId) throw new BusinessException(3003, '不能转账给自己');

    const apply = async (tx: Prisma.TransactionClient) => {
      const dup = await tx.tokenTransaction.findUnique({
        where: { bizType_bizId: { bizType: 'token_transfer_out', bizId: transferNo } },
      });
      if (dup) return;

      const fromAcc = await this.ensure(fromId, tx);
      if (fromAcc.balance < amount) throw new BusinessException(3001, '数权余额不足');
      const fromAfter = fromAcc.balance - amount;
      const fromUpdated = await tx.tokenAccount.updateMany({
        where: { userId: fromId, version: fromAcc.version },
        data: { balance: fromAfter, totalTransferOut: { increment: amount }, version: { increment: 1 } },
      });
      if (fromUpdated.count === 0) throw new BusinessException(3002, '数权并发冲突，请重试');
      await tx.tokenTransaction.create({
        data: { userId: fromId, type: 2, changeAmount: -amount, balanceAfter: fromAfter, bizType: 'token_transfer_out', bizId: transferNo },
      });

      // 接收方：新建获得批次（来源可追溯），余额入账
      await tx.tokenLot.create({
        data: { userId: toId, amount, sourceBonusId: null, sourceType: 'TRANSFER_IN', sourceId: transferNo },
      });
      const toAcc = await this.ensure(toId, tx);
      const toAfter = toAcc.balance + amount;
      const toUpdated = await tx.tokenAccount.updateMany({
        where: { userId: toId, version: toAcc.version },
        data: { balance: toAfter, totalTransferIn: { increment: amount }, version: { increment: 1 } },
      });
      if (toUpdated.count === 0) throw new BusinessException(3002, '数权并发冲突，请重试');
      await tx.tokenTransaction.create({
        data: { userId: toId, type: 1, changeAmount: amount, balanceAfter: toAfter, bizType: 'token_transfer_in', bizId: transferNo },
      });
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  /** 账户余额 + 获得批次明细 */
  async summary(userId: bigint) {
    const account = await this.ensure(userId);
    const lots = await this.prisma.tokenLot.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      total: account.balance,
      granted: account.totalGranted,
      transferIn: account.totalTransferIn,
      transferOut: account.totalTransferOut,
      lots,
    };
  }

  async transactions(userId: bigint, page = 1, pageSize = 20) {
    const [list, total] = await Promise.all([
      this.prisma.tokenTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tokenTransaction.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize };
  }
}
