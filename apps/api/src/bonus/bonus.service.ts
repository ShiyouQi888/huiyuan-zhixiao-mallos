import { Injectable } from '@nestjs/common';
import { BonusRecord, Prisma } from '@prisma/client';
import { Err } from '../common/business.exception';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../token/token.service';

export interface CreditBonusParams {
  userId: bigint;
  type: number;               // 1 直推 2 团队 3 平级 4 领导 5 分红
  amount: bigint;
  settleDate: Date;
  sourceUserId?: bigint | null;
  sourceOrderId?: bigint | null;
  planId?: bigint | null;
  stageId?: bigint | null;
  /**
   * 直推奖「先拆后分期」：太阳值部分已在计划创建时一次性入账，
   * 分期释放的每期金额即为现金全额，不再二次拆分。
   */
  cashOnly?: boolean;
  /** 幂等键，由调用方按业务构造，例 team:<uid>:<source>:<date> */
  idempotencyKey: string;
}

/** 奖金入账：拆分 70% 钱包 + 30% 太阳值，在入账时一次完成 */
@Injectable()
export class BonusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly token: TokenService,
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
      const cashAmount = params.cashOnly
        ? params.amount
        : BigInt(Math.round(Number(params.amount) * cashRatio));
      const tokenAmount = params.cashOnly ? 0n : params.amount - cashAmount;

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
        await this.token.credit(params.userId, tokenAmount, record.id, tx);
      }
      return record;
    });
  }

  /**
   * 直推奖「先拆」：计划创建时一次性把太阳值部分入账（不分期）。
   * 只增减太阳值，不产生钱包流水，因此 `walletTransactionId` 为空。
   */
  async creditDirectTokenPortion(
    params: {
      userId: bigint;
      amount: bigint;
      settleDate: Date;
      sourceOrderId?: bigint | null;
      planId?: bigint | null;
    },
    transaction?: Prisma.TransactionClient,
  ): Promise<BonusRecord | null> {
    if (params.amount <= 0n) return null;
    const apply = async (tx: Prisma.TransactionClient) => {
      if (params.planId) {
        const dup = await tx.bonusRecord.findFirst({
          where: { planId: params.planId, type: 1, stageId: null },
        });
        if (dup) return dup;
      }
      const record = await tx.bonusRecord.create({
        data: {
          userId: params.userId,
          type: 1,
          amount: params.amount,
          cashAmount: 0n,
          tokenAmount: params.amount,
          sourceOrderId: params.sourceOrderId ?? null,
          planId: params.planId ?? null,
          settleDate: params.settleDate,
        },
      });
      await this.token.credit(params.userId, params.amount, record.id, tx);
      return record;
    };
    return transaction ? apply(transaction) : this.prisma.$transaction(apply);
  }

  /** 收益汇总 */
  async summary(userId: bigint, includeDividend = true) {
    const where = { userId, ...(includeDividend ? {} : { type: { not: 5 } }) };
    const [aggregate, grouped, recent] = await Promise.all([
      this.prisma.bonusRecord.aggregate({ where, _sum: { amount: true } }),
      this.prisma.bonusRecord.groupBy({ by: ['type'], where, _sum: { amount: true } }),
      this.prisma.bonusRecord.findMany({ where, orderBy: [{ settleDate: 'desc' }, { id: 'desc' }], take: 20 }),
    ]);
    const totalsByType = new Map(grouped.map((item) => [item.type, item._sum.amount ?? 0n]));
    const byType = [1, 2, 3, 4, 5, 6].map((type) => ({ type, amount: totalsByType.get(type) ?? 0n }));
    return { total: aggregate._sum.amount ?? 0n, byType, recent };
  }

  /** 今日 / 本月收益汇总（按结算日期归属自然日、自然月） */
  async periodSummary(userId: bigint, includeDividend = true) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const base = { userId, ...(includeDividend ? {} : { type: { not: 5 } }) };
    const [today, month] = await Promise.all([
      this.prisma.bonusRecord.aggregate({
        where: { ...base, settleDate: { gte: startOfDay } },
        _sum: { amount: true, cashAmount: true, tokenAmount: true },
        _count: true,
      }),
      this.prisma.bonusRecord.aggregate({
        where: { ...base, settleDate: { gte: startOfMonth } },
        _sum: { amount: true, cashAmount: true, tokenAmount: true },
        _count: true,
      }),
    ]);
    const pack = (row: { _sum: { amount: bigint | null; cashAmount: bigint | null; tokenAmount: bigint | null }; _count: number }) => ({
      amount: row._sum.amount ?? 0n,
      cashAmount: row._sum.cashAmount ?? 0n,
      tokenAmount: row._sum.tokenAmount ?? 0n,
      count: row._count,
    });
    return { today: pack(today), month: pack(month), date: startOfDay.toISOString().slice(0, 10) };
  }

  async records(userId: bigint, page = 1, pageSize = 20, type?: number, includeDividend = true) {
    if (type !== undefined && (!Number.isInteger(type) || type < 1 || type > 6)) {
      throw Err.param('收益类型不合法');
    }
    const currentPage = Math.max(1, Number(page) || 1);
    const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 20));
    const where = {
      userId,
      ...(type !== undefined ? { type } : includeDividend ? {} : { type: { not: 5 } }),
    };
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
