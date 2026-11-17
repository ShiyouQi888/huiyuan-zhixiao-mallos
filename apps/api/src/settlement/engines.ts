/** 纯计算引擎：无 IO 依赖，便于单元测试 */

export interface AggUser {
  id: bigint;
  parentId: bigint | null;
  depth: number;
  rankLevel: number;
  peerBonusLocked: boolean;
}

/**
 * 树形归集：按 depth 降序遍历，子节点先算完再把业绩传给父节点。
 * 太阳线 N 叉树，O(N)。重复执行结果一致。
 */
export function aggregateTeam(
  users: AggUser[],
  own: Map<bigint, bigint>,
): Map<bigint, bigint> {
  const team = new Map<bigint, bigint>();
  const sorted = [...users].sort((a, b) => b.depth - a.depth);
  for (const u of sorted) {
    const cur = (team.get(u.id) ?? 0n) + (own.get(u.id) ?? 0n);
    team.set(u.id, cur);
    if (u.parentId !== null) {
      team.set(u.parentId, (team.get(u.parentId) ?? 0n) + cur);
    }
  }
  return team;
}

/** 奖金 70/30 拆分：入账时一次完成 */
export function splitBonus(amount: bigint, cashRatio = 0.7): { cash: bigint; token: bigint } {
  if (amount <= 0n) return { cash: 0n, token: 0n };
  const cash = BigInt(Math.round(Number(amount) * cashRatio));
  return { cash, token: amount - cash };
}

/** 等级判定：按历史累计业绩取最高可达等级，且只升不降 */
export function judgeRank(
  totalPerformance: bigint,
  currentRankId: number,
  ranks: Array<{ id: number; level: number; threshold: bigint; status?: number }>,
): { rankId: number; level: number; changed: boolean } {
  const current = ranks.find((rank) => rank.id === currentRankId);
  const eligible = [...ranks].filter((rank) => rank.status === undefined || rank.status === 1).sort((a, b) => a.level - b.level).reverse()
    .find((r) => totalPerformance >= r.threshold);
  const target = eligible && (!current || eligible.level > current.level) ? eligible : current;
  const targetId = target?.id ?? currentRankId;
  return {
    rankId: targetId,
    level: target?.level ?? 0,
    changed: targetId !== currentRankId,
  };
}

/** 平级奖锁定判定：首次满足「上级等级 <= 下级等级」即永久锁定 */
export function shouldLockPeer(parentLevel: number, childLevel: number, alreadyLocked: boolean): boolean {
  return !alreadyLocked && parentLevel <= childLevel;
}

/** 分红池人均：人数为 0 时不除零，返回 0 沉淀为平台留存 */
export function perCapita(pool: bigint, count: number): bigint {
  return count > 0 ? pool / BigInt(count) : 0n;
}

/** 被剔除的直推线：某上级的直接下线及其整棵子树 */
export interface ExcludedLine {
  parentId: bigint;
  childId: bigint;
  amount: bigint;
}

/**
 * 每位上级分别剔除自己伞下业绩最大的一条直推线。
 * - 候选条件：该上级至少有 2 条直接下线（单线独苗不参与剔除）；
 * - ratio > 0 时，还需最大线占该上级伞下当日业绩的比例超过阈值；
 * - 业绩并列时取 childId 较小者，确保结果确定。
 */
export function selectMaxExcludedLines(
  children: Map<bigint, Array<{ id: bigint; teamAmount: bigint }>>,
  ratio = 0,
): Map<bigint, ExcludedLine> {
  const excluded = new Map<bigint, ExcludedLine>();
  for (const [parentId, list] of children) {
    if (list.length < 2) continue;

    let childId = list[0].id;
    let maxAmount = list[0].teamAmount;
    for (const c of list) {
      if (c.teamAmount > maxAmount || (c.teamAmount === maxAmount && c.id < childId)) {
        maxAmount = c.teamAmount;
        childId = c.id;
      }
    }
    const total = list.reduce((s, c) => s + c.teamAmount, 0n);
    if (total <= 0n) continue;
    if (ratio > 0) {
      // 百分比配置支持 0.01% 精度；使用整数比较避免浮点误差。
      const scale = 1_000_000_000n;
      const scaledRatio = BigInt(Math.round(ratio * Number(scale)));
      if (maxAmount * scale <= total * scaledRatio) continue;
    }
    excluded.set(parentId, { parentId, childId, amount: maxAmount });
  }
  return excluded;
}

/** 团队奖有效基数：伞下当日业绩减去被剔除线的子树业绩 */
export function effectiveTeamBase(
  teamAmount: bigint,
  children: Array<{ id: bigint; teamAmount: bigint }>,
  excluded: Set<bigint>,
): bigint {
  if (excluded.size === 0) return teamAmount;
  const removed = children.filter((c) => excluded.has(c.id)).reduce((s, c) => s + c.teamAmount, 0n);
  return teamAmount - removed;
}
