import { Injectable } from '@nestjs/common';
import { BonusRecord } from '@prisma/client';
import { Err } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

export interface CreditBonusParams {
  userId: bigint;
  type: number;               // 1 直推 2 团队 3 平级 4 领导 5 分红
  amount: bigint;
  settleDate: Date;
  sourceUserId?: bigint | null;
  sourceOrderId?: bigint | null;
  planId?: bigint | null;
  stageId?: bigint | null;
  /** 幂等键，由调用方按业务构造，例 team:<uid>:<source>:<date> */
  idempotencyKey: string;
}

/** 奖金入账：拆分 70% 钱包 + 30% 数权，在入账时一次完成 */
@Injectable()
export class BonusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async creditBonus(params: CreditBonusParams): Promise<BonusRecord | null> {
    if (params.amount <= 0n) return null;
    const bizType = `bonus_${params.type}`;
    const bizId = params.idempotencyKey;

    return this.prisma.$transaction(async (tx) => {
      const dup = await tx.walletTransaction.findUnique({
        where: { bizType_bizId: { bizType, bizId } },
      });
      if (dup) {
        const existed = await tx.bonusRecord.findFirst({ where: { walletTransactionId: dup.id } });
        if (existed) return existed;
        return null;
      }

      const cashRatio = await this.config.getNumber('bonus.cash_ratio', 0.7);
      const cashAmount = BigInt(Math.round(Number(params.amount) * cashRatio));
      const tokenAmount = params.amount - cashAmount;

      const wallet = await tx.wallet.upsert({
        where: { userId: params.userId },
        create: { userId: params.userId },
        update: {},
      });
      const balanceAfter = wallet.balance + cashAmount;
      const updated = await tx.wallet.updateMany({
        where: { userId: params.userId, version: wallet.version },
        data: { balance: balanceAfter, totalIn: { increment: cashAmount }, version: { increment: 1 } },
      });
      if (updated.count === 0) throw new Error('钱包并发冲突');

      const walletTx = await tx.walletTransaction.create({
        data: {
          userId: params.userId,
          type: 1,
          changeAmount: cashAmount,
          balanceAfter,
          bizType,
          bizId,
          remark: `奖金入账（现金部分）`,
        },
      });

      const record = await tx.bonusRecord.create({
        data: {
          userId: params.userId,
          type: params.type,
          amount: params.amount,
          cashAmount,
          tokenAmount,
          sourceUserId: params.sourceUserId ?? null,
          sourceOrderId: params.sourceOrderId ?? null,
          planId: params.planId ?? null,
          stageId: params.stageId ?? null,
          settleDate: params.settleDate,
          walletTransactionId: walletTx.id,
        },
      });

      if (tokenAmount > 0n) {
        await tx.tokenLot.create({
          data: { userId: params.userId, amount: tokenAmount, sourceBonusId: record.id },
        });
      }
      return record;
    });
  }

  /** 收益汇总 */
  async summary(userId: bigint) {
    const [aggregate, grouped, recent] = await Promise.all([
      this.prisma.bonusRecord.aggregate({ where: { userId }, _sum: { amount: true } }),
      this.prisma.bonusRecord.groupBy({ by: ['type'], where: { userId }, _sum: { amount: true } }),
      this.prisma.bonusRecord.findMany({ where: { userId }, orderBy: [{ settleDate: 'desc' }, { id: 'desc' }], take: 20 }),
    ]);
    const totalsByType = new Map(grouped.map((item) => [item.type, item._sum.amount ?? 0n]));
    const byType = [1, 2, 3, 4, 5, 6].map((type) => ({ type, amount: totalsByType.get(type) ?? 0n }));
    return { total: aggregate._sum.amount ?? 0n, byType, recent };
  }

  async records(userId: bigint, page = 1, pageSize = 20, type?: number) {
    if (type !== undefined && (!Number.isInteger(type) || type < 1 || type > 6)) {
      throw Err.param('收益类型不合法');
    }
    const currentPage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const where = { userId, ...(type !== undefined ? { type } : {}) };
    const [list, total] = await Promise.all([
      this.prisma.bonusRecord.findMany({
        where,
        orderBy: [{ settleDate: 'desc' }, { id: 'desc' }],
        skip: (currentPage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.bonusRecord.count({ where }),
    ]);
    return { list, total, page: currentPage, pageSize: safePageSize };
  }
}
