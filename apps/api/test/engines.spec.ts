import { describe, expect, it } from 'vitest';
import {
  aggregateTeam,
  effectiveTeamBase,
  judgeRank,
  perCapita,
  selectGlobalExcludedLine,
  shouldLockPeer,
  splitBonus,
  type AggUser,
} from '../src/settlement/engines';

const u = (id: number, parentId: number | null, depth: number, rankLevel = 0): AggUser => ({
  id: BigInt(id),
  parentId: parentId === null ? null : BigInt(parentId),
  depth,
  rankLevel,
  equityStatus: 0,
  peerBonusLocked: false,
});

const RANKS = [
  { id: 0, level: 0, threshold: 0n },
  { id: 1, level: 1, threshold: 50000n },
  { id: 2, level: 2, threshold: 300000n },
  { id: 3, level: 3, threshold: 1000000n },
  { id: 4, level: 4, threshold: 3000000n },
];

describe('树形归集 aggregateTeam', () => {
  it('按 depth 降序归集，父节点累加全部后代业绩', () => {
    // 树：1 → 2 → 4；1 → 3。故意乱序输入
    const users = [u(1, null, 0), u(4, 2, 2), u(2, 1, 1), u(3, 1, 1)];
    const own = new Map<bigint, bigint>([
      [1n, 100n], [2n, 200n], [3n, 300n], [4n, 400n],
    ]);

    const team = aggregateTeam(users, own);

    expect(team.get(4n)).toBe(400n);
    expect(team.get(2n)).toBe(600n);   // 200 + 400
    expect(team.get(3n)).toBe(300n);
    expect(team.get(1n)).toBe(1000n);  // 100 + 600 + 300
  });

  it('无业绩的节点返回 0 而不是 undefined', () => {
    const team = aggregateTeam([u(1, null, 0)], new Map());
    expect(team.get(1n)).toBe(0n);
  });

  it('重复执行结果一致（可重入）', () => {
    const users = [u(1, null, 0), u(2, 1, 1), u(3, 2, 2)];
    const own = new Map<bigint, bigint>([[3n, 50n]]);
    const a = aggregateTeam(users, own);
    const b = aggregateTeam([...users].reverse(), own);
    expect(a).toEqual(b);
    expect(a.get(1n)).toBe(50n);
  });
});

describe('奖金 70/30 拆分', () => {
  it('250 拆为 175 + 75', () => {
    expect(splitBonus(250n)).toEqual({ cash: 175n, token: 75n });
  });

  it('10000 拆为 7000 + 3000', () => {
    expect(splitBonus(10000n)).toEqual({ cash: 7000n, token: 3000n });
  });

  it('奇数金额四舍五入后两项之和仍等于原金额', () => {
    for (const amount of [1n, 3n, 99n, 101n, 999n]) {
      const { cash, token } = splitBonus(amount);
      expect(cash + token).toBe(amount);
    }
  });

  it('非正数不产生入账', () => {
    expect(splitBonus(0n)).toEqual({ cash: 0n, token: 0n });
    expect(splitBonus(-100n)).toEqual({ cash: 0n, token: 0n });
  });
});

describe('等级判定（只升不降）', () => {
  it('按历史累计取最高可达等级', () => {
    expect(judgeRank(1_200_000n, 0, RANKS)).toMatchObject({ rankId: 3, level: 3, changed: true });
  });

  it('已达标更高等级时不降级', () => {
    expect(judgeRank(100n, 4, RANKS)).toMatchObject({ rankId: 4, level: 4, changed: false });
  });

  it('刚好等于门槛即达标', () => {
    expect(judgeRank(50000n, 0, RANKS).rankId).toBe(1);
    expect(judgeRank(49999n, 0, RANKS).rankId).toBe(0);
  });
});

describe('平级奖历史锁定', () => {
  it('上级等级 <= 下级等级时锁定', () => {
    expect(shouldLockPeer(1, 1, false)).toBe(true);
    expect(shouldLockPeer(1, 3, false)).toBe(true);
  });

  it('上级等级更高时不锁定', () => {
    expect(shouldLockPeer(4, 3, false)).toBe(false);
  });

  it('已锁定后永不回退（即使下级等级变化）', () => {
    expect(shouldLockPeer(6, 1, true)).toBe(false);
  });
});

describe('团队奖全局最大线剔除 selectGlobalExcludedLine', () => {
  const tree = (entries: Array<[number, number, number]>) => {
    // [parentId, childId, teamAmount]
    const map = new Map<bigint, Array<{ id: bigint; teamAmount: bigint }>>();
    for (const [pid, cid, amount] of entries) {
      const list = map.get(BigInt(pid)) ?? [];
      list.push({ id: BigInt(cid), teamAmount: BigInt(amount) });
      map.set(BigInt(pid), list);
    }
    return map;
  };

  it('全局只剔除一条：取整张网中业绩最大的直推线', () => {
    // 上级 1 的最大线 40000；上级 2 的最大线 120000 → 全局取后者
    const children = tree([
      [1, 11, 20000], [1, 12, 40000],
      [2, 21, 80000], [2, 22, 120000],
    ]);
    expect(selectGlobalExcludedLine(children, 0)).toEqual({ parentId: 2n, childId: 22n, amount: 120000n });
  });

  it('直接下线少于 2 条的上级不参与候选（单线独苗不剔除）', () => {
    const children = tree([[1, 11, 50000], [2, 21, 10000]]);
    expect(selectGlobalExcludedLine(children, 0)).toBeNull();
  });

  it('占比未超过阈值时该线不参与候选', () => {
    // 上级 1：最大线 50000/100000 = 50%，未超 60%
    // 上级 2：最大线 70000/100000 = 70% > 60%
    const children = tree([
      [1, 11, 50000], [1, 12, 50000],
      [2, 21, 70000], [2, 22, 30000],
    ]);
    expect(selectGlobalExcludedLine(children, 0.6)).toEqual({ parentId: 2n, childId: 21n, amount: 70000n });
  });

  it('业绩并列时取 parentId / childId 较小者，保证结果确定', () => {
    const children = tree([
      [2, 21, 100000], [2, 22, 100000],
      [1, 11, 100000], [1, 12, 100000],
    ]);
    expect(selectGlobalExcludedLine(children, 0)).toEqual({ parentId: 1n, childId: 11n, amount: 100000n });
  });

  it('无满足条件的上级时返回 null', () => {
    expect(selectGlobalExcludedLine(new Map(), 0)).toBeNull();
    const children = tree([[1, 11, 0], [1, 12, 0]]);
    expect(selectGlobalExcludedLine(children, 0)).toBeNull();
  });
});

describe('团队奖有效基数 effectiveTeamBase', () => {
  it('无剔除时等于伞下业绩', () => {
    expect(effectiveTeamBase(120000n, [{ id: 2n, teamAmount: 120000n }], new Set())).toBe(120000n);
  });

  it('剔除被选中线后只保留其余线业绩', () => {
    const children = [
      { id: 2n, teamAmount: 20000n },
      { id: 3n, teamAmount: 80000n },
      { id: 4n, teamAmount: 20000n },
    ];
    expect(effectiveTeamBase(120000n, children, new Set([3n]))).toBe(40000n);
  });
});

describe('分红池人均分配', () => {
  it('人数为 0 时不除零', () => {
    expect(perCapita(200000n, 0)).toBe(0n);
  });

  it('按人数平均分配', () => {
    expect(perCapita(200000n, 10)).toBe(20000n);
  });

  it('除不尽时向下取整，剩余沉淀平台', () => {
    expect(perCapita(100n, 3)).toBe(33n);
  });
});
