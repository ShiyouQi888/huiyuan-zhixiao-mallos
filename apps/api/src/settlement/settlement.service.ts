import { Injectable, Logger } from '@nestjs/common';
import { BonusService } from '../bonus/bonus.service';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { aggregateTeam, perCapita, judgeRank, shouldLockPeer, selectMaxExcludedLines, effectiveTeamBase, type AggUser } from './engines';

export { aggregateTeam, selectMaxExcludedLines, effectiveTeamBase } from './engines';

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

  /** Step2: 补齐当日已支付订单的业绩记录（幂等：orderId 唯一） */
  private async step2Performance(date: Date): Promise<void> {
    const next = new Date(date.getTime() + 86400_000);
    const orders = await this.prisma.order.findMany({
      where: { status: { in: [1, 2, 3] }, paidAt: { gte: date, lt: next }, performance: null },
      select: { id: true, userId: true, pvAmount: true, paidAt: true },
    });
    for (const o of orders) {
      await this.prisma.orderPerformance.upsert({
        where: { orderId: o.id },
        create: { orderId: o.id, userId: o.userId, amount: o.pvAmount, occurDate: o.paidAt ?? date },
        update: {},
      });
    }
  }

  /** Step3: 树形归集 → team_performance */
  private async step3Aggregate(date: Date): Promise<void> {
    const [perf, users] = await Promise.all([
      this.prisma.orderPerformance.findMany({ where: { occurDate: date } }),
      this.prisma.user.findMany({
        // 平台账号（超管/运营/财务/客服）不参与计酬与业绩归集
        where: { status: { not: 2 }, role: 'MEMBER' },
        select: { id: true, parentId: true, depth: true, rankLevel: true, peerBonusLocked: true },
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

  /** Step5: 各等级人数 + 全网计酬PV + 奖金池快照 */
  private async step5Snapshots(date: Date): Promise<void> {
    const ranks = await this.prisma.rank.findMany({ orderBy: { level: 'asc' } });
    const [network, users] = await Promise.all([
      this.prisma.orderPerformance.aggregate({ where: { occurDate: date }, _sum: { amount: true } }),
      this.prisma.user.findMany({ where: { status: { not: 2 }, role: 'MEMBER' }, select: { rankId: true } }),
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

  /** Step6: 直推奖分期释放；权益通不影响奖金计划。 */
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
        // 先拆后分期：太阳值部分已在计划创建时一次性入账，
        // 分期阶段发放的就是现金全额，不能再二次按 cash_ratio 拆分。
        // 历史计划（splitAt 为空）仍是全额分期，保持逐期拆分以免重复发放太阳值。
        cashOnly: stage.plan.splitAt !== null,
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

  /** 构建「直接下线 → 子树当日PV」表，并为每位会员选出自己最大的一条直推线 */
  private buildExclusion(
    rows: Array<{ userId: bigint; teamAmount: bigint; user: { parentId: bigint | null } }>,
    ratio: number,
  ): {
    children: Map<bigint, Array<{ id: bigint; teamAmount: bigint }>>;
    excludedLines: ReturnType<typeof selectMaxExcludedLines>;
  } {
    // 只统计「上级本身也是会员」的关系：平台账号（超管/运营等）不计酬，
    // 不能作为业务线顶点，否则最大线会落在平台账号上而永不生效。
    const memberIds = new Set(rows.map((r) => r.userId.toString()));
    const children = new Map<bigint, Array<{ id: bigint; teamAmount: bigint }>>();
    for (const row of rows) {
      const pid = row.user.parentId;
      if (pid === null || !memberIds.has(pid.toString())) continue;
      const list = children.get(pid) ?? [];
      list.push({ id: row.userId, teamAmount: row.teamAmount });
      children.set(pid, list);
    }
    return { children, excludedLines: selectMaxExcludedLines(children, ratio) };
  }

  /** 团队奖剔除开关与占比阈值（ratio=0 表示无条件剔除） */
  private async exclusionOptions(): Promise<{ enabled: boolean; ratio: number }> {
    const enabled = await this.config.get<boolean>('bonus.team_exclude_enabled', true);
    const ratio = enabled ? await this.config.getNumber('bonus.team_exclude_ratio', 0) : 0;
    return { enabled, ratio };
  }

  /** Step7: 团队奖 =（伞下当日PV - 本人最大直推线PV）× 自己费率 */
  private async step7TeamBonus(date: Date): Promise<void> {
    const ranks = await this.prisma.rank.findMany();
    // 按 level 建索引：teamPerformance 存的是 rankLevel，与 rank.id 无必然关系
    const rateMap = new Map(ranks.map((r) => [r.level, Number(r.teamRate)]));
    const { enabled, ratio } = await this.exclusionOptions();

    // 取全部行（含 rankLevel=0）：下线可能未晋升，但其业绩仍参与上级基数计算
    const rows = await this.prisma.teamPerformance.findMany({
      where: { statDate: date },
      include: { user: { select: { parentId: true, rankLevel: true } } },
    });
    const { children, excludedLines } = this.buildExclusion(rows, enabled ? ratio : 0);

    for (const row of rows) {
      if (row.user.rankLevel <= 0) continue;
      const rate = rateMap.get(row.rankLevel) ?? 0;
      const excludedLine = excludedLines.get(row.userId);
      const base = excludedLine
        ? effectiveTeamBase(row.teamAmount, children.get(row.userId) ?? [], new Set([excludedLine.childId]))
        : row.teamAmount;
      const amount = BigInt(Math.round(Number(base) * rate));
      if (excludedLine) {
        await this.prisma.auditLog.create({
          data: {
            operatorType: 'SYSTEM',
            action: 'TEAM_LINE_EXCLUDE',
            targetType: 'USER',
            targetId: row.userId,
            after: {
              statDate: date.toISOString().slice(0, 10),
              excludedLineId: excludedLine.childId.toString(),
              excludedLineAmount: excludedLine.amount.toString(),
              teamAmount: row.teamAmount.toString(),
              effectiveBase: base.toString(),
            } as never,
          },
        });
      }
      await this.bonus.creditBonus({
        userId: row.userId,
        type: 2,
        amount,
        settleDate: date,
        idempotencyKey: `team:${row.userId}:${date.toISOString().slice(0, 10)}`,
      });
    }
  }

  /** Step8: 平级奖（历史锁定）+ 领导奖；仅排除每位上级自己的最大直推关系 */
  private async step8PeerLeader(date: Date): Promise<void> {
    const ranks = await this.prisma.rank.findMany();
    const rateMap = new Map(ranks.map((r) => [r.level, Number(r.teamRate)]));
    const peerRate = await this.config.getNumber('bonus.peer_rate', 1.0);
    const leaderRate = await this.config.getNumber('bonus.leader_rate', 0.5);
    const { enabled, ratio } = await this.exclusionOptions();

    const rows = await this.prisma.teamPerformance.findMany({
      where: { statDate: date },
      include: {
        user: {
          select: {
            parentId: true,
            rankLevel: true,
            peerBonusLocked: true,
            parent: { select: { rankLevel: true, status: true } },
          },
        },
      },
      orderBy: { user: { depth: 'desc' } },
    });
    const { children, excludedLines } = this.buildExclusion(rows, enabled ? ratio : 0);

    for (const row of rows) {
      const x = row.user;
      const p = x.parent;
      if (!p || x.rankLevel <= 0) continue;
      if (p.status === 2) continue; // 已注销上级不再获得新增平级奖或领导奖

      // 当前父子关系若正是该上级的最大推广线，则该直推关系不产生领导奖/平级奖。
      // 推广线内部的其他会员仍按各自伞下规则结算。
      const parentId = x.parentId;
      if (parentId !== null && excludedLines.get(parentId)?.childId === row.userId) continue;

      // 领导奖/平级奖的基数是「下级实际拿到的团队奖」
      const childExcludedLine = excludedLines.get(row.userId);
      const base = effectiveTeamBase(
        row.teamAmount,
        children.get(row.userId) ?? [],
        new Set(childExcludedLine ? [childExcludedLine.childId] : []),
      );
      const teamBonus = BigInt(Math.round(Number(base) * (rateMap.get(x.rankLevel) ?? 0)));
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
        where: { rankId: rank.id, status: 0, role: 'MEMBER' },
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
    // 口径统一：以「结算日归属」的奖金记录为准，再按其关联的钱包流水/太阳值批次核对，
    // 避免日结在次日凌晨执行时 walletTransaction.createdAt 与 settleDate 跨自然日错位。
    const records = await this.prisma.bonusRecord.findMany({
      where: { settleDate: d },
      select: { id: true, cashAmount: true, tokenAmount: true, walletTransactionId: true },
    });
    const cashBonus = records.reduce((s, r) => s + r.cashAmount, 0n);
    const tokenBonus = records.reduce((s, r) => s + r.tokenAmount, 0n);
    const txIds = records.map((r) => r.walletTransactionId).filter((id): id is bigint => id !== null);
    const recordIds = records.map((r) => r.id);

    const [walletType1, tokenLots, walletSum, wallets, dividendSum, poolSum, quotaAccounts, quotaTransfers] =
      await Promise.all([
        txIds.length
          ? this.prisma.walletTransaction.aggregate({ where: { id: { in: txIds } }, _sum: { changeAmount: true } })
          : Promise.resolve({ _sum: { changeAmount: 0n } }),
        recordIds.length
          ? this.prisma.tokenLot.aggregate({ where: { sourceBonusId: { in: recordIds } }, _sum: { amount: true } })
          : Promise.resolve({ _sum: { amount: 0n } }),
        this.prisma.walletTransaction.aggregate({ _sum: { changeAmount: true } }),
        this.prisma.wallet.findMany({ select: { balance: true, frozen: true } }),
        this.prisma.dividend.aggregate({ where: { statDate: d }, _sum: { amount: true } }),
        this.prisma.rankSnapshot.aggregate({ where: { statDate: d }, _sum: { poolAmount: true } }),
        this.prisma.transferQuotaAccount.findMany({
          select: { userId: true, granted: true, adjustedOut: true, used: true, reserved: true, user: { select: { packageId: true, transferQuotaStatus: true } } },
        }),
        this.prisma.walletTransfer.groupBy({
          by: ['fromUserId', 'status'], _sum: { amount: true },
        }),
      ]);

    const sum = (rows: Array<{ balance?: bigint; frozen?: bigint }>) =>
      rows.reduce((s, r) => s + (r.balance ?? 0n) + (r.frozen ?? 0n), 0n);
    const walletTotal = sum(wallets);
    const expectedByUser = new Map<string, { used: bigint; reserved: bigint }>();
    for (const row of quotaTransfers) {
      const id = row.fromUserId.toString();
      const entry = expectedByUser.get(id) ?? { used: 0n, reserved: 0n };
      if (row.status === 'COMPLETED') entry.used += row._sum.amount ?? 0n;
      if (row.status === 'PENDING') entry.reserved += row._sum.amount ?? 0n;
      expectedByUser.set(id, entry);
    }
    const quotaByUser = new Map(quotaAccounts.map((row) => [row.userId.toString(), row]));
    const quotaUserIds = new Set([...expectedByUser.keys(), ...quotaByUser.keys()]);
    const quotaConsistent = [...quotaUserIds].every((id) => {
      const account = quotaByUser.get(id);
      const expected = expectedByUser.get(id) ?? { used: 0n, reserved: 0n };
      if (!account) return expected.used === 0n && expected.reserved === 0n;
      const status = account.user.packageId !== null && account.granted - account.adjustedOut <= account.used ? 1 : 0;
      return account.used === expected.used
        && account.reserved === expected.reserved
        && account.user.transferQuotaStatus === status;
    });

    const [plans, stageSums, releasedSums] = await Promise.all([
      this.prisma.bonusPlan.findMany({ select: { id: true, totalAmount: true, releasedAmount: true, splitAt: true } }),
      this.prisma.bonusStage.groupBy({ by: ['planId'], _sum: { amount: true } }),
      this.prisma.bonusStage.groupBy({ by: ['planId'], where: { status: 'RELEASED' }, _sum: { amount: true } }),
    ]);
    const stageSumByPlan = new Map(stageSums.map((row) => [row.planId.toString(), row._sum.amount ?? 0n]));
    const releasedByPlan = new Map(releasedSums.map((row) => [row.planId.toString(), row._sum.amount ?? 0n]));
    // 直推奖计划自洽：各期之和 = 计划总额（整数除法余数必须补进末期，否则静默少发）；
    // 已释放金额 = 已释放各期之和。
    // 「Σ各期 = 总额」只对新规则计划（splitAt 非空）成立：历史计划的期次已全部释放、
    // 金额无法回改，其少付差异由 scripts/backfill-direct-plan.ts 输出补偿清单。
    const directPlanConsistent = plans.every((plan) => {
      const id = plan.id.toString();
      const stageMatched = plan.splitAt === null || (stageSumByPlan.get(id) ?? 0n) === plan.totalAmount;
      return stageMatched && (releasedByPlan.get(id) ?? 0n) === plan.releasedAmount;
    });

    const checks = [
      { name: '奖金现金 = 钱包奖金流水', ok: cashBonus === (walletType1._sum.changeAmount ?? 0n) },
      { name: '奖金太阳值 = 太阳值批次', ok: tokenBonus === (tokenLots._sum.amount ?? 0n) },
      { name: '钱包流水合计 = 钱包余额+冻结', ok: (walletSum._sum.changeAmount ?? 0n) === walletTotal,
        detail: { flow: (walletSum._sum.changeAmount ?? 0n).toString(), balance: walletTotal.toString() } },
      { name: '分红合计 ≤ 分红池总额', ok: (dividendSum._sum.amount ?? 0n) <= (poolSum._sum.poolAmount ?? 0n) },
      { name: '权益通已用/预占 = 钱包转账统计', ok: quotaConsistent },
      { name: '直推奖计划：Σ各期 = 计划总额', ok: directPlanConsistent },
    ];
    return { statDate: d.toISOString().slice(0, 10), checks, allPassed: checks.every((c) => c.ok) };
  }
}
