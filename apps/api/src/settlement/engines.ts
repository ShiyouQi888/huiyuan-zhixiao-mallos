/** 纯计算引擎：无 IO 依赖，便于单元测试 */

export interface AggUser {
  id: bigint;
  parentId: bigint | null;
  depth: number;
  rankLevel: number;
  equityStatus: number;
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
