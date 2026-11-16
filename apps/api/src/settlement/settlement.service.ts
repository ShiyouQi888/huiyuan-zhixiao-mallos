import { Injectable, Logger } from '@nestjs/common';
import { BonusService } from '../bonus/bonus.service';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { aggregateTeam, perCapita, judgeRank, shouldLockPeer, type AggUser } from './engines';

export { aggregateTeam } from './engines';

/** 每日结算：11 步，支持断点续跑 + 幂等 + Redis 锁 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly bonus: BonusService,
    private readonly config: ConfigService,
  ) {}

  private toDate(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  /** 执行指定日期的日结（默认处理昨天） */
  async settle(targetDate?: Date, force = false): Promise<{ statDate: string; step: number; skipped?: boolean }> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const statDate = this.toDate(targetDate ?? yesterday);
    const lockKey = `lock:job:daily_settle:${statDate.toISOString().slice(0, 10)}`;

    const lock = await this.redis.acquireLock(lockKey, 7200);
    if (!lock) throw new Error('日结任务正在运行中，请勿重复触发');

    try {
      let batch = await this.prisma.settleBatch.findUnique({ where: { statDate } });
      if (!batch) {
        batch = await this.prisma.settleBatch.create({ data: { statDate, step: 0, status: 'RUNNING' } });
      }
      if (batch.status === 'DONE' && !force) {
        return { statDate: statDate.toISOString().slice(0, 10), step: 11, skipped: true };
      }
      if (force || batch.status === 'FAILED') {
        await this.prisma.settleBatch.update({
          where: { id: batch.id },
          data: { step: 0, status: 'RUNNING', error: null, startedAt: new Date(), finishedAt: null },
        });
        // 等级判定标记为可重入；累计业绩改为按日快照重算，不会重复累加
        await this.prisma.teamPerformance.updateMany({
          where: { statDate },
          data: { rankJudged: false },
        });
        // 同步内存中的批次状态，否则循环会从旧 step 开始而跳过全部步骤
        batch = { ...batch, step: 0, status: 'RUNNING' };
      }

      for (let step = batch.step; step <= 10; step++) {
        const started = Date.now();
        await this.runStep(step, statDate);
        await this.prisma.settleBatch.update({ where: { id: batch.id }, data: { step: step + 1 } });
        this.logger.log(`日结 ${statDate.toISOString().slice(0, 10)} Step ${step} 完成，耗时 ${Date.now() - started}ms`);
      }

      await this.prisma.settleBatch.update({
        where: { id: batch.id },
        data: { status: 'DONE', finishedAt: new Date() },
      });
      return { statDate: statDate.toISOString().slice(0, 10), step: 11 };
    } catch (e) {
      const batchRow = await this.prisma.settleBatch.findUnique({ where: { statDate } });
      if (batchRow) {
        await this.prisma.settleBatch.update({
          where: { id: batchRow.id },
          data: { status: 'FAILED', error: e instanceof Error ? e.message : String(e) },
        });
      }
      throw e;
    } finally {
      await this.redis.releaseLock(lockKey, lock);
    }
  }

  private async runStep(step: number, date: Date): Promise<void> {
    switch (step) {
      case 0: return; // 初始化批次已在 settle() 完成
      case 1: return; // 幂等检查：唯一键 + step 机制
      case 2: return this.step2Performance(date);
      case 3: return this.step3Aggregate(date);
      case 4: return this.step4Rank(date);
      case 5: return this.step5Snapshots(date);
      case 6: return this.step6DirectRelease(date);
      case 7: return this.step7TeamBonus(date);
      case 8: return this.step8PeerLeader(date);
      case 9: return this.step9Dividend(date);
      case 10: return this.step10Notify(date);
    }
  }

  /** Step2: 补齐当日 COMPLETED 订单的业绩记录（幂等：orderId 唯一） */
  private async step2Performance(date: Date): Promise<void> {
    const next = new Date(date.getTime() + 86400_000);
    const orders = await this.prisma.order.findMany({
      where: { status: 3, finishedAt: { gte: date, lt: next }, performance: null },
      select: { id: true, userId: true, amount: true, finishedAt: true },
    });
    for (const o of orders) {
      await this.prisma.orderPerformance.upsert({
        where: { orderId: o.id },
        create: { orderId: o.id, userId: o.userId, amount: o.amount, occurDate: date },
        update: {},
      });
    }
  }

  /** Step3: 树形归集 → team_performance */
  private async step3Aggregate(date: Date): Promise<void> {
    const [perf, users] = await Promise.all([
      this.prisma.orderPerformance.findMany({ where: { occurDate: date } }),
      this.prisma.user.findMany({
        where: { status: { not: 2 } },
        select: { id: true, parentId: true, depth: true, rankLevel: true, equityStatus: true, peerBonusLocked: true },
      }),
    ]);

    const own = new Map<bigint, bigint>();
    for (const p of perf) own.set(p.userId, (own.get(p.userId) ?? 0n) + p.amount);

    const team = aggregateTeam(users as AggUser[], own);
    for (const u of users) {
      await this.prisma.teamPerformance.upsert({
        where: { userId_statDate: { userId: u.id, statDate: date } },
        create: {
          userId: u.id,
          statDate: date,
          ownAmount: own.get(u.id) ?? 0n,
          teamAmount: team.get(u.id) ?? 0n,
          rankLevel: u.rankLevel,
        },
        update: {
          ownAmount: own.get(u.id) ?? 0n,
          teamAmount: team.get(u.id) ?? 0n,
          rankLevel: u.rankLevel,
        },
      });
    }
  }

  /** Step4: 等级判定（历史累计，只升不降） */
  private async step4Rank(date: Date): Promise<void> {
    const ranks = await this.prisma.rank.findMany({ orderBy: { level: 'asc' } });
    const rows = await this.prisma.teamPerformance.findMany({
      where: { statDate: date, rankJudged: false },
      include: { user: { select: { totalTeamPerformance: true, rankId: true, rankLevel: true } } },
    });

    for (const row of rows) {
      // 从每日快照重算历史累计：重跑日结不会产生重复累加
      const agg = await this.prisma.teamPerformance.aggregate({
        where: { userId: row.userId },
        _sum: { teamAmount: true },
      });
      const total = agg._sum.teamAmount ?? 0n;
      const judged = judgeRank(total, row.user.rankId, ranks);

      await this.prisma.$transaction(async (tx) => {
        if (judged.changed) {
          await tx.user.update({
            where: { id: row.userId },
            data: { rankId: judged.rankId, rankLevel: judged.level, rankAchievedAt: new Date() },
          });
          await tx.rankLog.create({
            data: {
              userId: row.userId,
              fromLevel: row.user.rankLevel,
              toLevel: judged.level,
              totalPerformance: total,
              triggerType: 'AUTO',
            },
          });
        }
        await tx.user.update({
          where: { id: row.userId },
          data: { totalTeamPerformance: total },
        });
        await tx.teamPerformance.update({
          where: { id: row.id },
          data: { rankJudged: true, rankLevel: judged.level },
        });
      });
    }
  }

  /** Step5: 各等级人数 + 全网业绩 + 池子快照 */
  private async step5Snapshots(date: Date): Promise<void> {
    const ranks = await this.prisma.rank.findMany({ orderBy: { level: 'asc' } });
    const [network, users] = await Promise.all([
      this.prisma.orderPerformance.aggregate({ where: { occurDate: date }, _sum: { amount: true } }),
      this.prisma.user.findMany({ where: { status: { not: 2 } }, select: { rankId: true } }),
    ]);
    const g = network._sum.amount ?? 0n;

    for (const r of ranks) {
      const count = users.filter((u) => u.rankId === r.id).length;
      const poolRate = Number(r.poolRate);
      const pool = BigInt(Math.round(Number(g) * poolRate));
      const perCapita = count > 0 ? pool / BigInt(count) : 0n;
      await this.prisma.rankSnapshot.upsert({
        where: { statDate_rankId: { statDate: date, rankId: r.id } },
        create: { statDate: date, rankId: r.id, userCount: count, totalPerformance: g, poolAmount: pool, perCapita },
        update: { userCount: count, totalPerformance: g, poolAmount: pool, perCapita },
      });
    }
  }

  /** Step6: 直推奖分期释放（计划一定跑完，暂停计酬不影响） */
  private async step6DirectRelease(date: Date): Promise<void> {
    const stages = await this.prisma.bonusStage.findMany({
      where: { status: 'PENDING', dueAt: { lte: date }, plan: { status: { in: ['PENDING', 'RELEASING'] } } },
      include: { plan: true },
    });
    for (const stage of stages) {
      await this.bonus.creditBonus({
        userId: stage.plan.beneficiaryId,
        type: 1,
        amount: stage.amount,
        settleDate: stage.dueAt,
        sourceOrderId: stage.plan.orderId,
        planId: stage.plan.id,
        stageId: stage.id,
        idempotencyKey: `direct:${stage.id}`,
      });
      await this.prisma.bonusStage.update({
        where: { id: stage.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      await this.prisma.bonusPlan.update({
        where: { id: stage.planId },
        data: {
          releasedAmount: { increment: stage.amount },
          status: stage.periodNo === stage.plan.periods ? 'COMPLETED' : 'RELEASING',
        },
      });
    }
  }

  /** Step7: 团队奖 = 自己伞下当日新增业绩 × 自己费率 */
  private async step7TeamBonus(date: Date): Promise<void> {
    const ranks = await this.prisma.rank.findMany();
    const rateMap = new Map(ranks.map((r) => [r.id, Number(r.teamRate)]));
    const rows = await this.prisma.teamPerformance.findMany({
      where: { statDate: date, rankLevel: { gt: 0 } },
      include: { user: { select: { equityStatus: true } } },
    });

    for (const row of rows) {
      if (row.user.equityStatus !== 0) continue; // 暂停计酬
      const rate = rateMap.get(row.rankLevel) ?? 0;
      const amount = BigInt(Math.round(Number(row.teamAmount) * rate));
      await this.bonus.creditBonus({
        userId: row.userId,
        type: 2,
        amount,
        settleDate: date,
        idempotencyKey: `team:${row.userId}:${date.toISOString().slice(0, 10)}`,
      });
    }
  }

  /** Step8: 平级奖（历史锁定）+ 领导奖，按 depth 从深到浅 */
  private async step8PeerLeader(date: Date): Promise<void> {
    const ranks = await this.prisma.rank.findMany();
    const rateMap = new Map(ranks.map((r) => [r.id, Number(r.teamRate)]));
    const peerRate = await this.config.getNumber('bonus.peer_rate', 1.0);
    const leaderRate = await this.config.getNumber('bonus.leader_rate', 0.5);

    const rows = await this.prisma.teamPerformance.findMany({
      where: { statDate: date },
      include: {
        user: {
          select: {
            parentId: true,
            rankLevel: true,
            equityStatus: true,
            peerBonusLocked: true,
            parent: { select: { rankLevel: true, equityStatus: true } },
          },
        },
      },
      orderBy: { user: { depth: 'desc' } },
    });

    for (const row of rows) {
      const x = row.user;
      const p = x.parent;
      if (!p || x.rankLevel <= 0) continue;

      const teamBonus = BigInt(Math.round(Number(row.teamAmount) * (rateMap.get(x.rankLevel) ?? 0)));
      if (teamBonus <= 0n) continue;

      // 首次满足「上级等级 <= 下级等级」即永久锁定（锁定记在下级 X 身上）
      let locked = x.peerBonusLocked;
      if (shouldLockPeer(p.rankLevel, x.rankLevel, locked)) {
        await this.prisma.user.update({
          where: { id: row.userId },
          data: { peerBonusLocked: true, peerBonusLockedAt: new Date() },
        });
        await this.prisma.auditLog.create({
          data: {
            operatorType: 'SYSTEM',
            action: 'PEER_LOCK',
            targetType: 'USER',
            targetId: row.userId,
            after: { parentId: x.parentId?.toString(), childId: row.userId.toString() } as never,
          },
        });
        locked = true;
      }

      if (p.equityStatus !== 0) continue; // 上级暂停时，锁定照常维护但不发钱

      if (locked) {
        await this.bonus.creditBonus({
          userId: x.parentId!,
          type: 3,
          amount: BigInt(Math.round(Number(teamBonus) * peerRate)),
          settleDate: date,
          sourceUserId: row.userId,
          idempotencyKey: `peer:${row.userId}:${date.toISOString().slice(0, 10)}`,
        });
      }

      await this.bonus.creditBonus({
        userId: x.parentId!,
        type: 4,
        amount: BigInt(Math.round(Number(teamBonus) * leaderRate)),
        settleDate: date,
        sourceUserId: row.userId,
        idempotencyKey: `leader:${row.userId}:${date.toISOString().slice(0, 10)}`,
      });
    }
  }

  /** Step9: 全网分红池，按「等级恰好等于该级」参与，人数为 0 时不分配 */
  private async step9Dividend(date: Date): Promise<void> {
    const ranks = await this.prisma.rank.findMany({ where: { poolRate: { gt: 0 } } });
    const snapshots = await this.prisma.rankSnapshot.findMany({
      where: { statDate: date, rankId: { in: ranks.map((r) => r.id) } },
    });

    for (const rank of ranks) {
      const snap = snapshots.find((s) => s.rankId === rank.id);
      if (!snap) continue;
      const share = perCapita(snap.poolAmount, snap.userCount);
      if (share <= 0n) continue; // 人数为 0 时不除零，池子沉淀为平台留存

      const users = await this.prisma.user.findMany({
        where: { rankId: rank.id, equityStatus: 0, status: 0 },
        select: { id: true },
      });
      for (const u of users) {
        await this.bonus.creditBonus({
          userId: u.id,
          type: 5,
          amount: share,
          settleDate: date,
          planId: snap.id,
          idempotencyKey: `dividend:${u.id}:${date.toISOString().slice(0, 10)}`,
        });
        await this.prisma.dividend.upsert({
          where: { statDate_userId: { statDate: date, userId: u.id } },
          create: { userId: u.id, statDate: date, rankId: rank.id, amount: share, snapshotId: snap.id },
          update: {},
        });
      }
    }
  }

  /** Step10: 通知（预留事件总线钩子） */
  private async step10Notify(_date: Date): Promise<void> {
    // MVP 阶段不接入推送渠道，保留扩展点。
  }

  /** 每日对账：5 条恒等式 */
  async reconcile(date: Date) {
    const d = this.toDate(date);
    const next = new Date(d.getTime() + 86400_000);
    const [cashBonus, walletType1, tokenBonus, tokenLots, walletSum, wallets, dividendSum, poolSum, equitySum, equityAccounts] =
      await Promise.all([
        this.prisma.bonusRecord.aggregate({ where: { settleDate: d }, _sum: { cashAmount: true } }),
        this.prisma.walletTransaction.aggregate({ where: { type: 1, createdAt: { gte: d, lt: next } }, _sum: { changeAmount: true } }),
        this.prisma.bonusRecord.aggregate({ where: { settleDate: d }, _sum: { tokenAmount: true } }),
        this.prisma.tokenLot.aggregate({ where: { createdAt: { gte: d, lt: next } }, _sum: { amount: true } }),
        this.prisma.walletTransaction.aggregate({ _sum: { changeAmount: true } }),
        this.prisma.wallet.findMany({ select: { balance: true, frozen: true } }),
        this.prisma.dividend.aggregate({ where: { statDate: d }, _sum: { amount: true } }),
        this.prisma.rankSnapshot.aggregate({ where: { statDate: d }, _sum: { poolAmount: true } }),
        this.prisma.equityTransaction.aggregate({ _sum: { changeAmount: true } }),
        this.prisma.equityAccount.findMany({ select: { balance: true } }),
      ]);

    const sum = (rows: Array<{ balance?: bigint; frozen?: bigint }>) =>
      rows.reduce((s, r) => s + (r.balance ?? 0n) + (r.frozen ?? 0n), 0n);
    const walletTotal = sum(wallets);
    const equityTotal = equityAccounts.reduce((s, r) => s + r.balance, 0n);

    const checks = [
      { name: '奖金现金 = 钱包奖金流水', ok: (cashBonus._sum.cashAmount ?? 0n) === (walletType1._sum.changeAmount ?? 0n) },
      { name: '奖金数权 = 数权批次', ok: (tokenBonus._sum.tokenAmount ?? 0n) === (tokenLots._sum.amount ?? 0n) },
      { name: '钱包流水合计 = 钱包余额+冻结', ok: (walletSum._sum.changeAmount ?? 0n) === walletTotal },
      { name: '分红合计 ≤ 分红池总额', ok: (dividendSum._sum.amount ?? 0n) <= (poolSum._sum.poolAmount ?? 0n) },
      { name: '权益值流水合计 = 权益值余额', ok: (equitySum._sum.changeAmount ?? 0n) === equityTotal },
    ];
    return { statDate: d.toISOString().slice(0, 10), checks, allPassed: checks.every((c) => c.ok) };
  }
}
