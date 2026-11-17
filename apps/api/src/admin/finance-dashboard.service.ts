import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type DayTotal = { date: string; count: number; amount: bigint; extra?: bigint };

@Injectable()
export class FinanceDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(daysInput = '30') {
    const parsedDays = Number(daysInput);
    const days = [7, 30, 90].includes(parsedDays) ? parsedDays : 30;
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400_000);
    const period = { gte: start, lt: end };

    const [
      walletAccounts, walletFlowByType, walletTransfers, walletTransfersPeriod,
      quotaTotalsRows, quotaFlowByBiz, tokenAccounts, tokenFlowByType, tokenTransfers,
      orderLifetime, orderPaidLifetime, orderPeriodRows, memberStatusRows, memberGrowth,
      rankRows, rankNames, packageRows, packages, bonusLifetime, bonusPeriod,
      bonusByType, pendingPlans, dailyOrders, dailyWallet, dailyMembers,
      dailyBonuses, dailyPerformance,
    ] = await Promise.all([
      this.prisma.wallet.aggregate({
        where: { user: { is: { role: 'MEMBER' } } },
        _sum: { balance: true, frozen: true, totalIn: true, totalOut: true, totalTransferIn: true, totalTransferOut: true },
        _count: { _all: true },
      }),
      this.prisma.walletTransaction.groupBy({
        by: ['type'], where: { createdAt: period, user: { is: { role: 'MEMBER' } } }, _sum: { changeAmount: true }, _count: { _all: true },
      }),
      this.prisma.walletTransfer.groupBy({ by: ['status'], where: { fromUser: { is: { role: 'MEMBER' } } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.walletTransfer.groupBy({
        by: ['status'], where: { createdAt: period, fromUser: { is: { role: 'MEMBER' } } }, _sum: { amount: true }, _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{
        accountCount: number; granted: bigint; adjustedOut: bigint; used: bigint; reserved: bigint;
        available: bigint; exhaustedAccounts: number; overage: bigint;
      }>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE q."granted" > 0)::int AS "accountCount",
          COALESCE(SUM(q."granted"), 0)::bigint AS "granted",
          COALESCE(SUM(q."adjustedOut"), 0)::bigint AS "adjustedOut",
          COALESCE(SUM(q."used"), 0)::bigint AS "used",
          COALESCE(SUM(q."reserved"), 0)::bigint AS "reserved",
          COALESCE(SUM(GREATEST(q."granted" - q."adjustedOut" - q."used" - q."reserved", 0)), 0)::bigint AS "available",
          COUNT(*) FILTER (WHERE q."granted" > 0 AND q."granted" - q."adjustedOut" - q."used" - q."reserved" <= 0)::int AS "exhaustedAccounts",
          COALESCE(SUM(GREATEST(q."used" + q."reserved" - q."granted" + q."adjustedOut", 0)), 0)::bigint AS "overage"
        FROM "TransferQuotaAccount" q
        INNER JOIN "User" u ON u."id" = q."userId"
        WHERE u."role" = 'MEMBER'
      `),
      this.prisma.transferQuotaTransaction.groupBy({
        by: ['bizType'], where: { createdAt: period, user: { is: { role: 'MEMBER' } } }, _sum: { changeAmount: true }, _count: { _all: true },
      }),
      this.prisma.tokenAccount.aggregate({
        where: { user: { is: { role: 'MEMBER' } } },
        _sum: { balance: true, totalGranted: true, totalTransferIn: true, totalTransferOut: true },
        _count: { _all: true },
      }),
      this.prisma.tokenTransaction.groupBy({
        by: ['type'], where: { createdAt: period, user: { is: { role: 'MEMBER' } } }, _sum: { changeAmount: true }, _count: { _all: true },
      }),
      this.prisma.tokenTransfer.groupBy({ by: ['status'], where: { fromUser: { is: { role: 'MEMBER' } } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { user: { is: { role: 'MEMBER' } } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.order.aggregate({ where: { user: { is: { role: 'MEMBER' } }, status: { in: [1, 2, 3] } }, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ['status', 'type'], where: { createdAt: period, user: { is: { role: 'MEMBER' } } },
        _sum: { amount: true, balanceDeduct: true, cashPay: true }, _count: { _all: true },
      }),
      this.prisma.user.groupBy({ by: ['status'], where: { role: 'MEMBER' }, _count: { _all: true } }),
      this.prisma.user.count({ where: { role: 'MEMBER', createdAt: period } }),
      this.prisma.user.groupBy({ by: ['rankLevel'], where: { role: 'MEMBER', status: { not: 2 } }, _count: { _all: true } }),
      this.prisma.rank.findMany({ select: { level: true, name: true }, orderBy: { level: 'asc' } }),
      this.prisma.user.groupBy({
        by: ['packageId'], where: { role: 'MEMBER', status: { not: 2 }, packageId: { not: null } }, _count: { _all: true },
      }),
      this.prisma.package.findMany({ select: { id: true, name: true, level: true }, orderBy: { level: 'asc' } }),
      this.prisma.bonusRecord.aggregate({ where: { user: { is: { role: 'MEMBER' } } }, _sum: { amount: true, cashAmount: true, tokenAmount: true }, _count: { _all: true } }),
      this.prisma.bonusRecord.aggregate({ where: { createdAt: period, user: { is: { role: 'MEMBER' } } }, _sum: { amount: true, cashAmount: true, tokenAmount: true }, _count: { _all: true } }),
      this.prisma.bonusRecord.groupBy({
        by: ['type'], where: { createdAt: period, user: { is: { role: 'MEMBER' } } }, _sum: { amount: true, cashAmount: true, tokenAmount: true }, _count: { _all: true },
      }),
      this.prisma.$queryRaw<Array<{ planCount: number; outstanding: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "planCount",
          COALESCE(SUM(GREATEST("totalAmount" - "releasedAmount", 0)), 0)::bigint AS "outstanding"
        FROM "BonusPlan" bp INNER JOIN "User" u ON u."id" = bp."beneficiaryId"
        WHERE u."role" = 'MEMBER' AND bp."status" IN ('PENDING', 'RELEASING')
      `),
      this.prisma.$queryRaw<DayTotal[]>(Prisma.sql`
        SELECT to_char(date_trunc('day', o."createdAt"), 'YYYY-MM-DD') AS "date",
          COUNT(*)::int AS "count", COALESCE(SUM(o."amount"), 0)::bigint AS "amount",
          COALESCE(SUM(CASE WHEN o."status" > 0 THEN o."amount" ELSE 0 END), 0)::bigint AS "extra"
        FROM "Order" o INNER JOIN "User" u ON u."id" = o."userId"
        WHERE u."role" = 'MEMBER' AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
        GROUP BY date_trunc('day', o."createdAt") ORDER BY 1
      `),
      this.prisma.$queryRaw<Array<{ date: string; inflow: bigint; outflow: bigint }>>(Prisma.sql`
        SELECT to_char(date_trunc('day', wt."createdAt"), 'YYYY-MM-DD') AS "date",
          COALESCE(SUM(CASE WHEN wt."changeAmount" > 0 THEN wt."changeAmount" ELSE 0 END), 0)::bigint AS "inflow",
          COALESCE(SUM(CASE WHEN wt."changeAmount" < 0 THEN -wt."changeAmount" ELSE 0 END), 0)::bigint AS "outflow"
        FROM "WalletTransaction" wt INNER JOIN "User" u ON u."id" = wt."userId"
        WHERE u."role" = 'MEMBER' AND wt."createdAt" >= ${start} AND wt."createdAt" < ${end}
        GROUP BY date_trunc('day', wt."createdAt") ORDER BY 1
      `),
      this.prisma.$queryRaw<Array<{ date: string; count: number }>>(Prisma.sql`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "date", COUNT(*)::int AS "count"
        FROM "User" WHERE "role" = 'MEMBER' AND "createdAt" >= ${start} AND "createdAt" < ${end}
        GROUP BY 1 ORDER BY 1
      `),
      this.prisma.$queryRaw<DayTotal[]>(Prisma.sql`
        SELECT to_char(date_trunc('day', br."createdAt"), 'YYYY-MM-DD') AS "date",
          COUNT(*)::int AS "count", COALESCE(SUM(br."amount"), 0)::bigint AS "amount"
        FROM "BonusRecord" br INNER JOIN "User" u ON u."id" = br."userId"
        WHERE u."role" = 'MEMBER' AND br."createdAt" >= ${start} AND br."createdAt" < ${end}
        GROUP BY date_trunc('day', br."createdAt") ORDER BY 1
      `),
      this.prisma.orderPerformance.groupBy({
        by: ['occurDate'], where: { occurDate: { gte: start, lt: end }, user: { is: { role: 'MEMBER' } } },
        _sum: { amount: true }, _count: { _all: true }, orderBy: { occurDate: 'asc' },
      }),
    ]);

    const statusCounts = new Map(memberStatusRows.map((row) => [row.status, row._count._all]));
    const walletTypeNames: Record<number, string> = { 1: '奖金入账', 2: '商城消费', 3: '钱包转出', 4: '钱包转入', 5: '后台调整', 6: '转账退回' };
    const quotaBizNames: Record<string, string> = {
      package_1: '档位发放', package_2: '档位升级', package_3: '档位复消',
      wallet_transfer_quota_reserve: '转出预占', wallet_transfer_quota_release: '预占返还',
      wallet_transfer_quota_consume: '转出确认', wallet_product_spend: '商城消费（旧规则）',
      wallet_product_spend_reversal: '商城额度规则修订返还',
      product_repurchase: '商品订单PV × 3发放',
      admin_manual_adjust: '后台额度调整', manual_rank_adjustment: '调级新增',
    };
    const bonusNames: Record<number, string> = { 1: '直推奖', 2: '团队奖', 3: '平级奖', 4: '领导奖', 5: '分红', 6: '人工调整' };
    const orderStatusNames: Record<number, string> = { 0: '待支付', 1: '已支付待发货', 2: '已发货', 3: '已完成' };
    const orderTypeNames: Record<number, string> = { 1: '档位新购', 2: '档位升级', 3: '档位复消', 4: '商城商品' };
    const walletByType = walletFlowByType.map((row) => ({
      type: row.type, name: walletTypeNames[row.type] ?? `类型 ${row.type}`,
      count: row._count._all, amount: row._sum.changeAmount ?? 0n,
    }));
    const quota = quotaTotalsRows[0] ?? {
      accountCount: 0, granted: 0n, adjustedOut: 0n, used: 0n, reserved: 0n,
      available: 0n, exhaustedAccounts: 0, overage: 0n,
    };
    const orderByStatus = new Map<number, { count: number; amount: bigint; paidAmount: bigint }>();
    const orderByType = new Map<number, { count: number; amount: bigint; paidAmount: bigint }>();
    for (const row of orderPeriodRows) {
      const amount = row._sum.amount ?? 0n;
      const paid = row.status > 0 ? amount : 0n;
      const statusValue = orderByStatus.get(row.status) ?? { count: 0, amount: 0n, paidAmount: 0n };
      statusValue.count += row._count._all; statusValue.amount += amount; statusValue.paidAmount += paid;
      orderByStatus.set(row.status, statusValue);
      const typeValue = orderByType.get(row.type) ?? { count: 0, amount: 0n, paidAmount: 0n };
      typeValue.count += row._count._all; typeValue.amount += amount; typeValue.paidAmount += paid;
      orderByType.set(row.type, typeValue);
    }
    const statusData = [...orderByStatus].map(([status, value]) => ({ status, name: orderStatusNames[status] ?? `状态 ${status}`, ...value }));
    const typeData = [...orderByType].map(([type, value]) => ({ type, name: orderTypeNames[type] ?? `类型 ${type}`, ...value }));
    const transferStatus = (rows: typeof walletTransfers) => Object.fromEntries(rows.map((row) => [row.status, {
      count: row._count._all, amount: row._sum.amount ?? 0n,
    }]));
    const trendByDate = new Map<string, Record<string, string | number | bigint>>();
    const trendRow = (date: string) => {
      if (!trendByDate.has(date)) trendByDate.set(date, { date, orderCount: 0, orderAmount: 0n, paidOrderAmount: 0n, walletIn: 0n, walletOut: 0n, bonusAmount: 0n, newMembers: 0, performance: 0n });
      return trendByDate.get(date)!;
    };
    for (const row of dailyOrders) { const day = trendRow(row.date); day.orderCount = row.count; day.orderAmount = row.amount; day.paidOrderAmount = row.extra ?? 0n; }
    for (const row of dailyWallet) { const day = trendRow(row.date); day.walletIn = row.inflow; day.walletOut = row.outflow; }
    for (const row of dailyMembers) trendRow(row.date).newMembers = row.count;
    for (const row of dailyBonuses) trendRow(row.date).bonusAmount = row.amount;
    for (const row of dailyPerformance) trendRow(row.occurDate.toISOString().slice(0, 10)).performance = row._sum.amount ?? 0n;

    const totalOrderPeriod = orderPeriodRows.reduce((value, row) => ({
      count: value.count + row._count._all,
      amount: value.amount + (row._sum.amount ?? 0n),
      paidAmount: value.paidAmount + (row.status > 0 ? row._sum.amount ?? 0n : 0n),
      balancePaid: value.balancePaid + (row.status > 0 ? row._sum.balanceDeduct ?? 0n : 0n),
      cashPaid: value.cashPaid + (row.status > 0 ? row._sum.cashPay ?? 0n : 0n),
    }), { count: 0, amount: 0n, paidAmount: 0n, balancePaid: 0n, cashPaid: 0n });
    const walletBalance = walletAccounts._sum.balance ?? 0n;
    const walletFrozen = walletAccounts._sum.frozen ?? 0n;
    const walletTxIn = walletByType.reduce((total, row) => total + (row.amount > 0n ? row.amount : 0n), 0n);
    const walletTxOut = walletByType.reduce((total, row) => total + (row.amount < 0n ? -row.amount : 0n), 0n);
    const tokenPeriodIn = tokenFlowByType.reduce((total, row) => total + (row._sum.changeAmount && row._sum.changeAmount > 0n ? row._sum.changeAmount : 0n), 0n);
    const tokenPeriodOut = tokenFlowByType.reduce((total, row) => total + (row._sum.changeAmount && row._sum.changeAmount < 0n ? -row._sum.changeAmount : 0n), 0n);
    const bonusLifetimeTotals = bonusLifetime._sum;
    const bonusPeriodTotals = bonusPeriod._sum;
    const pending = pendingPlans[0] ?? { planCount: 0, outstanding: 0n };

    return {
      period: { days, start, end },
      wallet: {
        accounts: walletAccounts._count._all,
        balance: walletBalance,
        available: walletBalance - walletFrozen,
        frozen: walletFrozen,
        lifetimeIn: walletAccounts._sum.totalIn ?? 0n,
        lifetimeOut: walletAccounts._sum.totalOut ?? 0n,
        lifetimeTransferIn: walletAccounts._sum.totalTransferIn ?? 0n,
        lifetimeTransferOut: walletAccounts._sum.totalTransferOut ?? 0n,
        period: { inflow: walletTxIn, outflow: walletTxOut, net: walletTxIn - walletTxOut, transactionCount: walletByType.reduce((count, row) => count + row.count, 0), byType: walletByType },
        transfers: { allTime: transferStatus(walletTransfers), period: transferStatus(walletTransfersPeriod) },
      },
      transferQuota: {
        accounts: quota.accountCount, granted: quota.granted, adjustedOut: quota.adjustedOut,
        used: quota.used, reserved: quota.reserved, available: quota.available,
        exhaustedAccounts: quota.exhaustedAccounts, overage: quota.overage,
        periodByBusiness: quotaFlowByBiz.map((row) => ({
          bizType: row.bizType, name: quotaBizNames[row.bizType] ?? row.bizType,
          count: row._count._all, changeAmount: row._sum.changeAmount ?? 0n,
        })),
      },
      sunValue: {
        accounts: tokenAccounts._count._all,
        circulating: tokenAccounts._sum.balance ?? 0n,
        issued: tokenAccounts._sum.totalGranted ?? 0n,
        lifetimeTransferIn: tokenAccounts._sum.totalTransferIn ?? 0n,
        lifetimeTransferOut: tokenAccounts._sum.totalTransferOut ?? 0n,
        period: { inflow: tokenPeriodIn, outflow: tokenPeriodOut, byType: tokenFlowByType.map((row) => ({ type: row.type, count: row._count._all, amount: row._sum.changeAmount ?? 0n })) },
        transfers: { allTime: transferStatus(tokenTransfers) },
      },
      orders: {
        lifetimeCount: orderLifetime._count._all,
        lifetimeAmount: orderLifetime._sum.amount ?? 0n,
        paidLifetimeCount: orderPaidLifetime._count._all,
        paidLifetimeAmount: orderPaidLifetime._sum.amount ?? 0n,
        period: totalOrderPeriod,
        byStatus: statusData,
        byType: typeData,
      },
      bonuses: {
        lifetime: { count: bonusLifetime._count._all, amount: bonusLifetimeTotals.amount ?? 0n, walletAmount: bonusLifetimeTotals.cashAmount ?? 0n, sunValueAmount: bonusLifetimeTotals.tokenAmount ?? 0n },
        period: { count: bonusPeriod._count._all, amount: bonusPeriodTotals.amount ?? 0n, walletAmount: bonusPeriodTotals.cashAmount ?? 0n, sunValueAmount: bonusPeriodTotals.tokenAmount ?? 0n },
        pendingRelease: { plans: pending.planCount, amount: pending.outstanding },
        byType: bonusByType.map((row) => ({ type: row.type, name: bonusNames[row.type] ?? `类型 ${row.type}`, count: row._count._all, amount: row._sum.amount ?? 0n, walletAmount: row._sum.cashAmount ?? 0n, sunValueAmount: row._sum.tokenAmount ?? 0n })),
      },
      members: {
        total: [...statusCounts.values()].reduce((total, count) => total + count, 0),
        active: statusCounts.get(0) ?? 0, frozen: statusCounts.get(1) ?? 0, deleted: statusCounts.get(2) ?? 0,
        newInPeriod: memberGrowth,
        withPackage: packageRows.reduce((total, row) => total + row._count._all, 0),
        rankDistribution: rankRows.map((row) => ({ level: row.rankLevel, name: rankNames.find((rank) => rank.level === row.rankLevel)?.name ?? `等级 ${row.rankLevel}`, count: row._count._all })),
        packageDistribution: packageRows.map((row) => ({ packageId: row.packageId, name: packages.find((item) => item.id === row.packageId)?.name ?? `档位 ${row.packageId}`, count: row._count._all })),
      },
      trend: [...trendByDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    };
  }
}
