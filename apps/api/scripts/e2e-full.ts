/**
 * 全链路 E2E：注册 → 绑定推荐关系 → 产生业绩 → 直推奖 → 等级自动晋升
 *          → 晋升参与分红 → 平级奖 → 领导奖
 *
 * 关系树（业绩自下而上归集，每个叶子 1 单至尊卡 = 20000）：
 *   平台超管
 *   └─ A
 *      ├─ B
 *      │  ├─ C
 *      │  │  ├─ D ── L1, L2
 *      │  │  └─ Z1, Z2
 *      │  └─ Y1, Y2
 *      └─ X1, X2
 *
 * 归集结果：D=4万 → C=8万 → B=12万 → A=16万
 *
 * 约定：为在可接受时间内跑完，脚本通过真实管理端接口临时调低等级门槛
 * （Lv1/2/3/4 → 1万/2万/4万/8万），结束时会恢复原值。
 *
 * 用法：先启动 API，再执行 npx ts-node scripts/e2e-full.ts
 */
import 'dotenv/config';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE ?? '13800138000';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456';

/** 至尊卡：价格 20000，单笔业绩最高 */
const PACKAGE_ID = 4;
const ORDER_AMOUNT = 20000;

/** 临时门槛（原值见 SEED_THRESHOLDS） */
const TEMP_THRESHOLDS: Record<number, number> = { 1: 10000, 2: 20000, 3: 40000, 4: 80000 };
/** 种子默认门槛，与 prisma/seed.ts 保持一致，作为恢复基准 */
const SEED_THRESHOLDS: Record<number, number> = {
  0: 0, 1: 50000, 2: 300000, 3: 1000000, 4: 3000000, 5: 6000000, 6: 10000000,
};

/** 各账号的直属下级（用于校验绑定关系） */
const TREE: Record<string, string[]> = {
  A: ['B', 'X1', 'X2'],
  B: ['C', 'Y1', 'Y2'],
  C: ['D', 'Z1', 'Z2'],
  D: ['L1', 'L2'],
  L1: [], L2: [], Z1: [], Z2: [], Y1: [], Y2: [], X1: [], X2: [],
};
/** 注册顺序：父先于子 */
const REGISTER_ORDER = ['A', 'B', 'C', 'D', 'L1', 'L2', 'Z1', 'Z2', 'Y1', 'Y2', 'X1', 'X2'];
/** 下单账号（每账号仅能新购一次） */
const BUYERS = ['L1', 'L2', 'Z1', 'Z2', 'Y1', 'Y2', 'X1', 'X2'];

const TEAM_AMOUNT: Record<string, number> = {
  L1: 20000, L2: 20000, Z1: 20000, Z2: 20000, Y1: 20000, Y2: 20000, X1: 20000, X2: 20000,
  D: 40000, C: 80000, B: 120000, A: 160000,
};
const RANK_LEVEL: Record<string, number> = {
  L1: 2, L2: 2, Z1: 2, Z2: 2, Y1: 2, Y2: 2, X1: 2, X2: 2,
  D: 3, C: 4, B: 4, A: 4,
};
const TEAM_RATE: Record<number, number> = { 1: 0.03, 2: 0.06, 3: 0.09, 4: 0.12 };
/** 平级奖：上级与下级同等级时，上级拿下级团队奖 × peer_rate(1.0) */
const PEER_EDGES: Array<[string, string]> = [['B', 'C'], ['A', 'B']];
/** 直推奖：叶子订单 → 其直接上级 */
const DIRECT_EDGES: Array<[string, string]> = [
  ['L1', 'D'], ['L2', 'D'],
  ['Z1', 'C'], ['Z2', 'C'],
  ['Y1', 'B'], ['Y2', 'B'],
  ['X1', 'A'], ['X2', 'A'],
];
/** 参与 4 级分红池的账号 */
const POOL4_MEMBERS = ['C', 'B', 'A'];

/**
 * 团队奖剔除规则：每个直接下线 ≥ 2 条的上级，分别剔除子树业绩最大的一条线。
 * D 的两条下线 L1/L2 业绩并列，按 id 较小者剔除 L1；A/B/C/D 均剔除自己的最大线。
 */
/** 每位上级只减去自己最大的直接下线子树业绩 */
const EFFECTIVE_BASE: Record<string, number> = {
  A: TEAM_AMOUNT.A - TEAM_AMOUNT.B,
  B: TEAM_AMOUNT.B - TEAM_AMOUNT.C,
  C: TEAM_AMOUNT.C - TEAM_AMOUNT.D,
  D: TEAM_AMOUNT.D - ORDER_AMOUNT,
};

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    const text = typeof detail === 'bigint' ? detail.toString() : JSON.stringify(detail);
    failures.push(`${name}${text ? ` :: ${text}` : ''}`);
    console.error(`  ✗ ${name}${text ? ` :: ${text}` : ''}`);
  }
}

async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    // 日结为大批量操作（数千会员时单步可达数分钟），放宽头部超时
    signal: AbortSignal.timeout(600_000),
  });
  const json = (await res.json()) as { code: number; message: string; data: T };
  if (json.code !== 0) throw new Error(`${path} 返回错误: ${json.code} ${json.message}`);
  return json.data;
}

const num = (v: unknown): number => Number(v ?? 0);
const sum = (rows: Array<{ amount: unknown }>): number => rows.reduce((s, r) => s + num(r.amount), 0);

interface Account {
  tag: string;
  phone: string;
  token: string;
  userId: number;
  inviteCode: string;
}

/** 期望接口抛错且错误信息包含指定文案；返回不符合时的说明 */
async function expectReject(path: string, options: { method?: string; body?: unknown; token?: string }, keyword: string): Promise<string> {
  try {
    await api(path, options);
  } catch (e) {
    const msg = (e as Error).message;
    return msg.includes(keyword) ? '' : `抛错但不含「${keyword}」: ${msg}`;
  }
  return '未抛错';
}

async function main(): Promise<void> {
  console.log('=== 太阳线会员系统 · 全链路 E2E ===\n');

  /* ---------- 0. 管理员登录 ---------- */
  const admin = await api<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD },
  });
  const adminMe = await api<any>('/api/me', { token: admin.token });
  console.log(`[0] 管理员已登录（${ADMIN_PHONE}）`);

  /* ---------- 1. 临时调低等级门槛 ---------- */
  const ranks = await api<any[]>('/api/admin/ranks', { token: admin.token });

  // 先按种子值无条件还原（防止上一次运行异常退出残留），再从低到高调低
  for (const rank of [...ranks].sort((a, b) => b.level - a.level)) {
    const seed = SEED_THRESHOLDS[rank.level];
    if (seed === undefined) continue;
    await api(`/api/admin/ranks/${rank.id}`, {
      method: 'PUT',
      token: admin.token,
      body: { threshold: seed },
    });
  }
  for (const rank of [...ranks].sort((a, b) => a.level - b.level)) {
    const target = TEMP_THRESHOLDS[rank.level];
    if (target === undefined) continue;
    await api(`/api/admin/ranks/${rank.id}`, {
      method: 'PUT',
      token: admin.token,
      body: { threshold: target },
    });
  }
  console.log('[1] 等级门槛已临时调低：' + ranks
    .filter((r) => TEMP_THRESHOLDS[r.level] !== undefined)
    .map((r) => `Lv${r.level}=${TEMP_THRESHOLDS[r.level]}`).join(' / '));

  try {
    /* ---------- 2. 注册账号树 ---------- */
    console.log('\n[2] 注册与绑定推荐关系');
    const runId = String(Math.floor(Math.random() * 9000) + 1000);
    const accounts = new Map<string, Account>();
    let seq = 0;

    for (const tag of REGISTER_ORDER) {
      const phone = `139${runId}${String(seq++).padStart(4, '0')}`;
      const parentTag = Object.keys(TREE).find((key) => TREE[key].includes(tag));
      const parent = parentTag ? accounts.get(parentTag) : undefined;
      const result = await api<{ token: string; user: { id: string; phone: string } }>('/api/auth/register', {
        method: 'POST',
        body: {
          phone,
          password: '123456',
          nickname: `E2E-${tag}`,
          inviteCode: parent?.inviteCode ?? adminMe.inviteCode,
        },
      });
      const me = await api<any>('/api/me', { token: result.token });
      accounts.set(tag, {
        tag,
        phone,
        token: result.token,
        userId: num(result.user.id),
        inviteCode: me.inviteCode,
      });
      console.log(`  ${tag.padEnd(3)} ${phone} → 上级 ${me.parentId ?? '无'}`);
    }

    for (const [parentTag, children] of Object.entries(TREE)) {
      if (!children.length) continue;
      const parent = accounts.get(parentTag)!;
      const team = await api<any[]>('/api/me/team', { token: parent.token });
      const phones = new Set(team.map((u) => u.phone));
      check(
        `${parentTag} 的直属下级 = ${children.join(', ')}`,
        children.every((child) => phones.has(accounts.get(child)!.phone)),
        team.map((u) => u.phone),
      );
    }

    /* ---------- 3. 产生业绩 ---------- */
    console.log('\n[3] 下单产生业绩（至尊卡 20000/单，权益值全额抵扣）');
    const day1 = new Date().toISOString().slice(0, 10);
    // 直推奖第 1 期到期 = 订单完成日次日 UTC 00:00，结算该日释放第 1 期（不会带上第 2 期）
    const day2 = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

    const settle = async (date: string) => {
      const r = await api<any>('/api/admin/settlements/daily/rerun', {
        method: 'POST',
        token: admin.token,
        body: { date },
      });
      return r.result ?? r;
    };

    // 先跑一次日结，把当日已有的历史订单业绩固化为基线，
    // 否则分红池断言会被此前的测试数据干扰。
    await settle(day1);
    const poolsBefore = await api<any[]>(`/api/admin/dividend/pools?date=${day1}`, { token: admin.token });
    const baselinePerf = num(poolsBefore.find((row) => row.rankId === 4)?.totalPerformance ?? 0);
    console.log(`  当日已有业绩基线 = ${baselinePerf}`);

    for (const tag of BUYERS) {
      const account = accounts.get(tag)!;
      await api(`/api/admin/wallets/${account.userId}/adjust`, {
        method: 'POST',
        token: admin.token,
        body: { amount: ORDER_AMOUNT, reason: `E2E 充值 ${tag} 购卡钱包` },
      });
    }

    let orderCount = 0;
    // 串行执行：同一会员重复下单会触发「已购买礼包」校验
    for (const tag of BUYERS) {
      const account = accounts.get(tag)!;
      const order = await api<any>('/api/orders', {
        method: 'POST',
        token: account.token,
        body: { type: 1, packageId: PACKAGE_ID, useBalance: true },
      });
      await api(`/api/admin/orders/${encodeURIComponent(order.orderNo)}/deliver`, {
        method: 'POST',
        token: admin.token,
      });
      await api(`/api/orders/${encodeURIComponent(order.orderNo)}/confirm`, {
        method: 'POST',
        token: account.token,
      });
      orderCount += 1;
    }
    check(`完成 ${BUYERS.length} 笔订单（下单 → 交付 → 确认）`, orderCount === BUYERS.length, orderCount);

    /* ---------- 4. 日结：业绩 / 晋升 / 团队 / 平级 / 领导 / 分红 ---------- */
    console.log(`\n[4] 每日结算（${day1}）`);
    const s1 = await settle(day1);
    check('日结跑满 11 步', s1.step === 11, s1);

    /* ---------- 5. 等级自动晋升 ---------- */
    console.log('\n[5] 等级自动晋升');
    for (const tag of REGISTER_ORDER) {
      const account = accounts.get(tag)!;
      const rank = await api<any>('/api/me/rank', { token: account.token });
      const expectedLevel = RANK_LEVEL[tag] ?? 0;
      check(
        `${tag} 团队累计 ${TEAM_AMOUNT[tag]} → Lv${expectedLevel}`,
        num(rank.totalPerformance) === TEAM_AMOUNT[tag] && rank.rankLevel === expectedLevel,
        { performance: num(rank.totalPerformance), level: rank.rankLevel },
      );
    }

    const bonusOf = async (tag: string, type: number): Promise<number> => {
      const account = accounts.get(tag)!;
      const r = await api<any>(`/api/me/bonus/records?type=${type}&page=1`, { token: account.token });
      return sum(r.list ?? []);
    };

    /* ---------- 6. 团队奖（type=2） ---------- */
    console.log('\n[6] 团队奖 = 有效基数 × 职级费率（每位会员均已剔除自己的最大推广线）');
    const teamBonusExpected: Record<string, number> = {};
    for (const tag of REGISTER_ORDER) {
      const base = EFFECTIVE_BASE[tag] ?? TEAM_AMOUNT[tag];
      teamBonusExpected[tag] = Math.round(base * (TEAM_RATE[RANK_LEVEL[tag]] ?? 0));
    }
    for (const tag of REGISTER_ORDER) {
      const actual = await bonusOf(tag, 2);
      check(`${tag} 团队奖 ${teamBonusExpected[tag]}（基数 ${EFFECTIVE_BASE[tag] ?? TEAM_AMOUNT[tag]}）`,
        actual === teamBonusExpected[tag], actual);
    }

    /* ---------- 7. 平级奖（type=3） ---------- */
    console.log('\n[7] 平级奖：各自被剔除的直接推广关系不产生平级奖');
    // A→B 与 B→C 分别是各自上级的最大推广线，平级奖都为 0。
    for (const [parent, child] of PEER_EDGES) {
      const actual = await bonusOf(parent, 3);
      check(`${parent}→${child} 属该上级被剔除推广线，平级奖为 0`, actual === 0, actual);
    }
    // D(Lv3) 的上级 C(Lv4) 等级更高，本就不构成平级
    const dPeer = await bonusOf('D', 3);
    check('D 与上级 C 不同级，平级奖为 0', dPeer === 0, dPeer);

    /* ---------- 8. 领导奖（type=4） ---------- */
    console.log('\n[8] 领导奖：每条推广线内仅排除对应上级与该直推下级的关系');
    // A/B/C 各从两条未剔除线获得 1200×0.5；D 从一条未剔除线获得 1200×0.5。
    const leaderExpected: Record<string, number> = { A: 1200, B: 1200, C: 1200, D: 600 };
    for (const tag of REGISTER_ORDER) {
      const expected = leaderExpected[tag] ?? 0;
      const actual = await bonusOf(tag, 4);
      check(`${tag} 领导奖 ${expected}`, actual === expected, actual);
    }

    /* ---------- 9. 分红池（type=5） ---------- */
    console.log('\n[9] 晋升参与分红（按职级池人数平分）');
    const poolsAfter = await api<any[]>(`/api/admin/dividend/pools?date=${day1}`, { token: admin.token });
    const snap4 = poolsAfter.find((row) => row.rankId === 4);
    const networkPerformance = baselinePerf + BUYERS.length * ORDER_AMOUNT;
    const expectedPool4 = Math.round(networkPerformance * 0.02);
    check(
      '4 级池总额 = (基线业绩 + 本次业绩) × 2%',
      num(snap4?.poolAmount) === expectedPool4,
      { actual: num(snap4?.poolAmount), expected: expectedPool4 },
    );
    // 历史测试账号可能同为 Lv4，池人数只多不少；本次三人必须全部在列
    check(`4 级池人数 ≥ ${POOL4_MEMBERS.length}`, num(snap4?.userCount) >= POOL4_MEMBERS.length, snap4?.userCount);
    check(
      '人均 = 池总额 ÷ 人数（整数除法，余数沉淀）',
      num(snap4?.perCapita) === Math.floor(num(snap4?.poolAmount) / num(snap4?.userCount)),
      { perCapita: num(snap4?.perCapita), pool: num(snap4?.poolAmount), count: num(snap4?.userCount) },
    );

    const day1Dividends = (await api<any[]>('/api/admin/dividends', { token: admin.token }))
      .filter((row) => String(row.statDate).slice(0, 10) === day1 && row.rankId === 4);
    check(
      `4 级池由 ${POOL4_MEMBERS.join('/')} 平分`,
      POOL4_MEMBERS.every((tag) => day1Dividends.some((r) => r.userId === accounts.get(tag)!.userId)),
      day1Dividends.map((r) => r.userId),
    );
    for (const tag of POOL4_MEMBERS) {
      const actual = await bonusOf(tag, 5);
      check(`${tag} 分红 = 人均 ${num(snap4?.perCapita)}`, actual === num(snap4?.perCapita), actual);
    }
    const nonPool = await bonusOf('D', 5);
    check('D（Lv3）不参与 4 级池，分红为 0', nonPool === 0, nonPool);

    /* ---------- 10. 次日日结：直推奖分期释放 ---------- */
    console.log(`\n[10] 直推奖分期释放（${day2}，第 1 期 = 总额 ÷ 20）`);
    const s2 = await settle(day2);
    check('次日日结跑满 11 步', s2.step === 11, s2);

    const directExpected = new Map<string, number>();
    for (const [child, parent] of DIRECT_EDGES) {
      directExpected.set(parent, (directExpected.get(parent) ?? 0) + ORDER_AMOUNT / 20);
    }
    for (const [tag, expected] of directExpected) {
      const actual = await bonusOf(tag, 1);
      check(`${tag} 直推奖第 1 期 ${expected}`, actual === expected, actual);
    }

    /* ---------- 11. 账务对账 ---------- */
    console.log('\n[11] 账务对账');
    const recon = await api<any>('/api/admin/settlements/reconcile', {
      method: 'POST',
      token: admin.token,
      body: { date: day1 },
    });
    for (const item of recon.checks as Array<{ name: string; ok: boolean }>) {
      check(`对账：${item.name}`, item.ok);
    }
    check('5 项对账恒等式全部成立', recon.allPassed === true, recon.checks);

    /* ---------- 12. 收益汇总一致性 ---------- */
    console.log('\n[12] 收益汇总一致性（累计收益 = 钱包 + 数权）');
    for (const tag of REGISTER_ORDER) {
      const account = accounts.get(tag)!;
      const [summary, wallet, tokenSummary] = await Promise.all([
        api<any>('/api/me/bonus', { token: account.token }),
        api<any>('/api/me/wallet', { token: account.token }),
        api<any>('/api/me/token', { token: account.token }),
      ]);
      check(
        `${tag} 累计收益 = 钱包 + 数权`,
        num(summary.total) === num(wallet.balance) + num(tokenSummary.total),
        { total: num(summary.total), wallet: num(wallet.balance), token: num(tokenSummary.total) },
      );
    }

    /* ---------- 13. 数权互转（即时到账） ---------- */
    console.log('\n[13] 数权互转（即时到账）');
    const fromTag = 'A';
    const toTag = 'B';
    const fromAccount = accounts.get(fromTag)!;
    const toAccount = accounts.get(toTag)!;

    // 转出方需先实名并设置转账支付密码
    await api('/api/me/realname', {
      method: 'POST',
      token: fromAccount.token,
      body: { realName: 'E2E A', idCard: '110101199001011234' },
    });
    await api('/api/me/transfer-password', {
      method: 'POST',
      token: fromAccount.token,
      body: { newPassword: '654321' },
    });

    const TRANSFER_AMOUNT = 100;
    const [fromBefore, toBefore] = await Promise.all([
      api<any>('/api/me/token', { token: fromAccount.token }),
      api<any>('/api/me/token', { token: toAccount.token }),
    ]);

    const transferResult = await api<any>('/api/me/token/transfers', {
      method: 'POST',
      token: fromAccount.token,
      body: { toPhone: toAccount.phone, amount: TRANSFER_AMOUNT, paymentPassword: '654321', remark: 'E2E 数权互转' },
    });
    check('数权转账创建即完成（无需接收方确认）', transferResult.status === 'COMPLETED', transferResult);

    const [fromAfter, toAfter] = await Promise.all([
      api<any>('/api/me/token', { token: fromAccount.token }),
      api<any>('/api/me/token', { token: toAccount.token }),
    ]);
    check(
      `${fromTag} 数权余额减少 ${TRANSFER_AMOUNT}`,
      num(fromBefore.total) - num(fromAfter.total) === TRANSFER_AMOUNT,
      { before: num(fromBefore.total), after: num(fromAfter.total) },
    );
    check(
      `${toTag} 数权余额增加 ${TRANSFER_AMOUNT}`,
      num(toAfter.total) - num(toBefore.total) === TRANSFER_AMOUNT,
      { before: num(toBefore.total), after: num(toAfter.total) },
    );
    check(
      `${fromTag} 累计转出 = ${TRANSFER_AMOUNT}`,
      num(fromAfter.transferOut) - num(fromBefore.transferOut) === TRANSFER_AMOUNT,
      { before: num(fromBefore.transferOut), after: num(fromAfter.transferOut) },
    );
    check(
      `${toTag} 累计转入 = ${TRANSFER_AMOUNT}`,
      num(toAfter.transferIn) - num(toBefore.transferIn) === TRANSFER_AMOUNT,
      { before: num(toBefore.transferIn), after: num(toAfter.transferIn) },
    );
    check(
      '互转守恒：双方余额合计不变',
      num(fromBefore.total) + num(toBefore.total) === num(fromAfter.total) + num(toAfter.total),
      { before: num(fromBefore.total) + num(toBefore.total), after: num(fromAfter.total) + num(toAfter.total) },
    );

    const fromTx = await api<any>('/api/me/token/transactions?page=1', { token: fromAccount.token });
    const outTx = (fromTx.list ?? []).find((r: any) => r.bizType === 'token_transfer_out');
    check(
      '转出方流水：出账金额正确',
      !!outTx && num(outTx.changeAmount) === -TRANSFER_AMOUNT,
      outTx,
    );
    const toTx = await api<any>('/api/me/token/transactions?page=1', { token: toAccount.token });
    const inTx = (toTx.list ?? []).find((r: any) => r.bizType === 'token_transfer_in');
    check(
      '接收方流水：入账金额正确',
      !!inTx && num(inTx.changeAmount) === TRANSFER_AMOUNT,
      inTx,
    );

    const records = await api<any>('/api/me/transfers/token?page=1', { token: fromAccount.token });
    check(
      '数权转账记录可查询且状态为已完成',
      (records.list ?? []).some((r: any) => r.transferNo === transferResult.transferNo && r.status === 'COMPLETED'),
      records.list,
    );

    /* ---------- 14. 权益值：可下单抵扣 / 可转账 / 用完暂停 / 复消恢复 ---------- */
    console.log('\n[14] 权益值：可下单抵扣、可转账（用完 → 暂停计酬；复消恢复）');
    const eqFromTag = 'L1';
    const eqToTag = 'L2';
    const eqFrom = accounts.get(eqFromTag)!;
    const eqTo = accounts.get(eqToTag)!;

    // 购卡订单以钱包支付，权益值应保持获赠的 60000 不变
    const [eqBefore, eqToBefore] = await Promise.all([
      api<any>('/api/me/equity', { token: eqFrom.token }),
      api<any>('/api/me/equity', { token: eqTo.token }),
    ]);
    const eqTotal = num(eqBefore.balance);
    check(
      `${eqFromTag} 购卡获赠权益值 ${eqTotal}`,
      eqTotal === 60000 && num(eqBefore.totalGranted) === 60000,
      { balance: eqTotal, totalGranted: num(eqBefore.totalGranted) },
    );

    // 复消前置：额度未用完时不得复消
    const rejectMsg = await expectReject(
      '/api/orders',
      { method: 'POST', token: eqTo.token, body: { type: 3, packageId: PACKAGE_ID, useBalance: true } },
      '权益值尚未用完',
    );
    check(`${eqToTag} 额度未用完时复消被拒`, rejectMsg === '', rejectMsg);

    // 下单抵扣：普通商品（无线蓝牙耳机 399）用权益值支付
    const GOODS_ID = 3;
    const GOODS_AMOUNT = 399;
    const address = await api<any>('/api/me/addresses', {
      method: 'POST',
      token: eqFrom.token,
      body: {
        receiver: 'E2E L1', phone: eqFrom.phone, province: '北京市', city: '北京市',
        district: '朝阳区', detail: '某路 1 号', isDefault: true,
      },
    });
    const goodsOrder = await api<any>('/api/orders', {
      method: 'POST',
      token: eqFrom.token,
      body: { type: 4, productId: GOODS_ID, addressId: String(address.id), quantity: 1, useEquity: true, useBalance: false },
    });
    check(
      `${eqFromTag} 下单使用权益值抵扣 ${GOODS_AMOUNT}`,
      num(goodsOrder.equityDeduct) === GOODS_AMOUNT && num(goodsOrder.balanceDeduct) === 0,
      goodsOrder,
    );
    const eqAfterGoods = await api<any>('/api/me/equity', { token: eqFrom.token });
    const eqRemain = eqTotal - GOODS_AMOUNT;
    check(
      `${eqFromTag} 抵扣后权益值余额 ${eqRemain}`,
      num(eqAfterGoods.balance) === eqRemain,
      num(eqAfterGoods.balance),
    );

    // 转出方实名 + 转账支付密码
    await api('/api/me/realname', {
      method: 'POST',
      token: eqFrom.token,
      body: { realName: 'E2E L1', idCard: '110101199001011235' },
    });
    await api('/api/me/transfer-password', {
      method: 'POST',
      token: eqFrom.token,
      body: { newPassword: '654321' },
    });

    // 全额转出：新账号大额触发风控，需管理端复核
    const eqTransfer = await api<any>('/api/me/equity/transfers', {
      method: 'POST',
      token: eqFrom.token,
      body: { toPhone: eqTo.phone, amount: eqRemain, paymentPassword: '654321', remark: 'E2E 权益值全额转出' },
    });
    check('新账号大额权益值转出触发人工复核标记', eqTransfer.riskFlag === 1, eqTransfer);

    const eqAfterOut = await api<any>('/api/me/equity', { token: eqFrom.token });
    check(`${eqFromTag} 转出后权益值余额 = 0`, num(eqAfterOut.balance) === 0, num(eqAfterOut.balance));

    const eqFromDetail = await api<any>(`/api/admin/members/${eqFrom.userId}`, { token: admin.token });
    check(
      `${eqFromTag} 额度用完 → equityStatus = 1（暂停计酬）`,
      eqFromDetail.equityStatus === 1,
      eqFromDetail.equityStatus,
    );

    // 管理端复核通过 → 接收方入账
    const eqRecords = await api<any>('/api/me/transfers/equity?page=1', { token: eqFrom.token });
    const eqRecord = (eqRecords.list ?? []).find((r: any) => r.transferNo === eqTransfer.transferNo);
    const reviewed = await api<any>(`/api/admin/transfers/${eqRecord.id}/review`, {
      method: 'POST',
      token: admin.token,
      body: { action: 'APPROVE', platform: 'equity' },
    });
    check('管理端复核通过后转账完成', reviewed.status === 'COMPLETED', reviewed);

    const eqToAfter = await api<any>('/api/me/equity', { token: eqTo.token });
    check(
      `${eqToTag} 接收方权益值增加 ${eqRemain}`,
      num(eqToAfter.balance) - num(eqToBefore.balance) === eqRemain,
      { before: num(eqToBefore.balance), after: num(eqToAfter.balance) },
    );

    // 复消：充值钱包后按档位全额下单，完成后恢复计酬与额度
    await api(`/api/admin/wallets/${eqFrom.userId}/adjust`, {
      method: 'POST',
      token: admin.token,
      body: { amount: ORDER_AMOUNT, reason: `E2E 充值 ${eqFromTag} 复消钱包` },
    });
    const repurchase = await api<any>('/api/orders', {
      method: 'POST',
      token: eqFrom.token,
      body: { type: 3, packageId: PACKAGE_ID, useBalance: true },
    });
    await api(`/api/admin/orders/${encodeURIComponent(repurchase.orderNo)}/deliver`, {
      method: 'POST',
      token: admin.token,
    });
    await api(`/api/orders/${encodeURIComponent(repurchase.orderNo)}/confirm`, {
      method: 'POST',
      token: eqFrom.token,
    });

    const eqRestored = await api<any>('/api/me/equity', { token: eqFrom.token });
    check(
      `${eqFromTag} 复消后权益值恢复 ${eqTotal}`,
      num(eqRestored.balance) === eqTotal && num(eqRestored.totalGranted) - num(eqBefore.totalGranted) === eqTotal,
      { balance: num(eqRestored.balance), totalGranted: num(eqRestored.totalGranted) },
    );
    const eqFromDetail2 = await api<any>(`/api/admin/members/${eqFrom.userId}`, { token: admin.token });
    check(
      `${eqFromTag} 复消后 equityStatus = 0（恢复计酬）`,
      eqFromDetail2.equityStatus === 0,
      eqFromDetail2.equityStatus,
    );

    console.log(`\n=== 结果：通过 ${passed} 项，失败 ${failed} 项 ===`);
  } finally {
    /* ---------- 恢复等级门槛（从高到低，避免触发相邻等级校验） ---------- */
    console.log('\n[恢复] 等级门槛还原');
    for (const rank of [...ranks].sort((a, b) => b.level - a.level)) {
      const seed = SEED_THRESHOLDS[rank.level];
      if (seed === undefined) continue;
      await api(`/api/admin/ranks/${rank.id}`, {
        method: 'PUT',
        token: admin.token,
        body: { threshold: seed },
      }).catch((e) => console.error(`  恢复 Lv${rank.level} 失败：${e.message}`));
      console.log(`  Lv${rank.level} → ${seed}`);
    }
    console.log('  已还原为种子门槛');
  }

  if (failed > 0) {
    console.error('\n失败项：');
    for (const item of failures) console.error(`  - ${item}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('E2E 异常:', e);
  process.exit(1);
});
