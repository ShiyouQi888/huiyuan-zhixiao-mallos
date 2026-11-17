/**
 * 全链路 E2E（PV 计酬 + 权益通 + 太阳值 + 直推奖「先拆后分期」）
 *
 * 关系树（8 个叶子各买 1 单至尊卡，业绩自下而上归集）：
 *   平台超管
 *   └─ A
 *      ├─ B
 *      │  ├─ C
 *      │  │  ├─ D ── L1, L2
 *      │  │  └─ Z1, Z2
 *      │  └─ Y1, Y2
 *      └─ X1, X2
 *
 * 归集（P = 档位 PV）：L*=P → D=2P → C=4P → B=6P → A=8P
 * 等级门槛在脚本开始时按 P 临时下调（Lv1=P/2、Lv2=P、Lv3=2P、Lv4=4P），结束时按种子值还原。
 *
 * 覆盖：注册绑定 → 下单（幂等键）→ 支付即生效（PV 业绩 / 权益通 / 直推计划）
 *      → 交付（快递单号）→ 确认 → 日结 11 步 → 等级晋升 → 团队奖（最大线剔除）
 *      → 平级奖 → 领导奖 → 分红池 → 太阳值支付即到账 → 次日直推首期现金
 *      → 对账 7 项 → 收益恒等式 → 太阳值互转 → 权益通与复消约束
 *
 * 用法：先启动 API，再执行 pnpm --filter @solar/api test:e2e
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE ?? '13800138000';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456';

/** 至尊卡（价格与 PV 从接口读取，不写死） */
const PACKAGE_ID = 4;
/** 种子默认门槛，与 prisma/seed.ts 保持一致，作为恢复基准 */
const SEED_THRESHOLDS: Record<number, number> = {
  0: 0, 1: 50000, 2: 300000, 3: 1000000, 4: 3000000, 5: 6000000, 6: 10000000,
};

/** 各账号的直属下级 */
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
/** 直接下级为 2 条的会员：各自剔除其中业绩最大的一条推广线 */
const TWO_CHILD_PARENTS = ['A', 'B', 'C', 'D'];
/** 平级奖候选边：被剔除的直接推广关系不产生平级奖 */
const PEER_EDGES: Array<[string, string]> = [['A', 'B'], ['B', 'C']];

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    const text = detail === undefined ? '' : JSON.stringify(detail, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    failures.push(`${name}${text ? ` :: ${text}` : ''}`);
    console.error(`  ✗ ${name}${text ? ` :: ${text}` : ''}`);
  }
}

async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; token?: string; idempotencyKey?: string } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.idempotencyKey ? { 'x-idempotency-key': options.idempotencyKey } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    // 日结为大批量操作，放宽头部超时
    signal: AbortSignal.timeout(600_000),
  });
  const json = (await res.json()) as { code: number; message: string; data: T };
  if (json.code !== 0) throw new Error(`${path} 返回错误: ${json.code} ${json.message}`);
  return json.data;
}

const num = (v: unknown): number => Number(v ?? 0);
const rows = <T = any>(result: unknown): T[] =>
  Array.isArray(result) ? (result as T[]) : (((result as { list?: T[] } | null)?.list) ?? []);
const sum = (list: Array<{ amount: unknown }>): number => list.reduce((total, row) => total + num(row.amount), 0);
const key = (scene: string): string => `${scene}-${randomUUID()}`;

interface Account {
  tag: string;
  phone: string;
  token: string;
  userId: number;
  inviteCode: string;
}

/** 期望接口抛错且错误信息包含指定文案；返回不符合时的说明 */
async function expectReject(
  path: string,
  options: { method?: string; body?: unknown; token?: string; idempotencyKey?: string },
  keyword: string,
): Promise<string> {
  try {
    await api(path, options);
  } catch (error) {
    const message = (error as Error).message;
    return message.includes(keyword) ? '' : `抛错但不含「${keyword}」: ${message}`;
  }
  return '未抛错';
}

async function main(): Promise<void> {
  console.log('=== 太阳线会员系统 · 全链路 E2E（PV / 权益通 / 太阳值）===\n');

  /* ---------- 0. 管理员登录 ---------- */
  const admin = await api<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD },
  });
  const adminMe = await api<any>('/api/me', { token: admin.token });
  console.log(`[0] 管理员已登录（${ADMIN_PHONE}）`);

  /* ---------- 1. 档位与参数 ---------- */
  const packages = await api<any[]>('/api/admin/packages', { token: admin.token });
  const pkg = packages.find((item) => item.id === PACKAGE_ID);
  if (!pkg) throw new Error(`档位 ${PACKAGE_ID} 不存在，请先执行 prisma:seed`);
  const PRICE = num(pkg.price);
  const P = num(pkg.pv);
  const configs = await api<any[]>('/api/admin/configs', { token: admin.token });
  const configValue = (configKey: string, fallback: number): number => {
    const row = configs.find((item) => item.key === configKey);
    const parsed = Number(row?.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const cashRatio = configValue('bonus.cash_ratio', 0.7);
  const rewardRate = configValue('bonus.reward_rate', 1.0);
  const defaultPeriods = configValue('bonus.direct_periods', 20);
  const directRate = pkg.directRewardRate === null || pkg.directRewardRate === undefined
    ? rewardRate : Number(pkg.directRewardRate);
  const periods = pkg.directReleaseDays === null || pkg.directReleaseDays === undefined
    ? defaultPeriods : Number(pkg.directReleaseDays);
  console.log(`[1] 测试档位 ${pkg.name}：价格 ${PRICE}，PV ${P}，直推比例 ${directRate}，${periods} 期释放`);

  /** 业绩 → 期望等级（临时门槛：Lv1=P/2、Lv2=P、Lv3=2P、Lv4=4P） */
  const TEMP_THRESHOLDS: Record<number, number> = {
    1: Math.floor(P / 2), 2: P, 3: P * 2, 4: P * 4,
  };
  const expectedLevel = (performance: number): number => {
    let level = 0;
    for (const [rankLevel, threshold] of Object.entries(TEMP_THRESHOLDS)) {
      if (performance >= threshold) level = Math.max(level, Number(rankLevel));
    }
    return level;
  };
  /** 团队业绩（含自己）：叶 1 单，D 2、C 4、B 6、A 8 */
  const TEAM_AMOUNT: Record<string, number> = {
    L1: P, L2: P, Z1: P, Z2: P, Y1: P, Y2: P, X1: P, X2: P,
    D: P * 2, C: P * 4, B: P * 6, A: P * 8,
  };
  /** 每位会员剔除自己最大直推线后的计酬基数 */
  const LARGEST_LINE: Record<string, number> = { A: P * 6, B: P * 4, C: P * 2, D: P };
  const effectiveBase = (tag: string): number => TEAM_AMOUNT[tag] - (LARGEST_LINE[tag] ?? 0);
  /** 费率与池比例一律取库内配置（等级可由后台调整，不能写死） */
  const teamRateByLevel = new Map<number, number>();
  const poolRateByLevel = new Map<number, number>();
  const rankIdByLevel = new Map<number, number>();
  const teamBonusOf = (tag: string): number =>
    Math.round(effectiveBase(tag) * (teamRateByLevel.get(expectedLevel(TEAM_AMOUNT[tag])) ?? 0));

  /* ---------- 2. 临时调低等级门槛 ---------- */
  const ranks = await api<any[]>('/api/admin/ranks', { token: admin.token });
  for (const rank of ranks) {
    teamRateByLevel.set(rank.level, Number(rank.teamRate));
    poolRateByLevel.set(rank.level, Number(rank.poolRate));
    rankIdByLevel.set(rank.level, rank.id);
  }
  // 先按种子值降序无条件还原（防止上次异常退出残留），再按新 P 从低到高设置
  for (const rank of [...ranks].sort((a, b) => b.level - a.level)) {
    const seed = SEED_THRESHOLDS[rank.level];
    if (seed === undefined) continue;
    await api(`/api/admin/ranks/${rank.id}`, { method: 'PUT', token: admin.token, body: { threshold: seed } });
  }
  for (const rank of [...ranks].sort((a, b) => a.level - b.level)) {
    const target = TEMP_THRESHOLDS[rank.level];
    if (target === undefined) continue;
    await api(`/api/admin/ranks/${rank.id}`, { method: 'PUT', token: admin.token, body: { threshold: target } });
  }
  console.log(`[2] 等级门槛已按 PV 调低：${Object.entries(TEMP_THRESHOLDS).map(([lv, t]) => `Lv${lv}=${t}`).join(' / ')}`);

  try {
    /* ---------- 3. 注册账号树 ---------- */
    console.log('\n[3] 注册与绑定推荐关系');
    const runId = String(Date.now()).slice(-8);
    const accounts = new Map<string, Account>();
    let seq = 0;

    for (const tag of REGISTER_ORDER) {
      const phone = `139${String((Number(runId) % 90000000) + 10000000 + seq++).slice(-8)}`;
      const parentTag = Object.keys(TREE).find((parent) => TREE[parent].includes(tag));
      const parent = parentTag ? accounts.get(parentTag) : undefined;
      const result = await api<{ token: string; user: { id: string; phone: string } }>('/api/auth/register', {
        method: 'POST',
        body: {
          phone,
          password: 'E2e2026!',
          nickname: `E2E-${tag}`,
          inviteCode: parent?.inviteCode ?? adminMe.inviteCode,
        },
      });
      const me = await api<any>('/api/me', { token: result.token });
      accounts.set(tag, { tag, phone, token: result.token, userId: num(result.user.id), inviteCode: me.inviteCode });
    }
    check(`注册 ${REGISTER_ORDER.length} 个账号并绑定推荐关系`, accounts.size === REGISTER_ORDER.length, accounts.size);

    for (const [parentTag, children] of Object.entries(TREE)) {
      if (!children.length) continue;
      const parent = accounts.get(parentTag)!;
      const team = await api<any[]>('/api/me/team', { token: parent.token });
      const phones = new Set(rows<any>(team).map((member) => member.phone));
      check(`${parentTag} 的直属下级 = ${children.join(', ')}`,
        children.every((child) => phones.has(accounts.get(child)!.phone)), [...phones]);
    }

    /* ---------- 4. 下单：幂等键 / 余额抵扣 / PV 快照 ---------- */
    console.log(`\n[4] 下单产生业绩（${pkg.name}，钱包全额抵扣）`);
    const day1 = new Date().toISOString().slice(0, 10);
    const day2 = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const settle = async (date: string) => {
      const result = await api<any>('/api/admin/settlements/daily/rerun', {
        method: 'POST',
        token: admin.token,
        body: { date },
      });
      return result.result ?? result;
    };

    for (const tag of BUYERS) {
      const account = accounts.get(tag)!;
      await api(`/api/admin/wallets/${account.userId}/adjust`, {
        method: 'POST',
        token: admin.token,
        idempotencyKey: key(`e2e-fund-${tag}`),
        body: { amount: PRICE, reason: `E2E 充值 ${tag} 购卡钱包` },
      });
    }

    const orders = new Map<string, any>();
    const orderKeys = new Map<string, string>();
    let orderSeq = 0;
    for (const tag of BUYERS) {
      const account = accounts.get(tag)!;
      const orderKey = `e2e-order-${tag}-${runId}`;
      const order = await api<any>('/api/orders', {
        method: 'POST',
        token: account.token,
        idempotencyKey: orderKey,
        body: { type: 1, packageId: PACKAGE_ID, useBalance: true },
      });
      orderKeys.set(tag, orderKey);
      check(`${tag} 订单已支付、PV 快照 ${P}`,
        order.status === 1 && num(order.pvAmount) === P && num(order.balanceDeduct) === PRICE,
        { status: order.status, pv: num(order.pvAmount), deduct: num(order.balanceDeduct) });
      await api(`/api/admin/orders/${encodeURIComponent(order.orderNo)}/deliver`, {
        method: 'POST',
        token: admin.token,
        body: { trackingNo: `E2E${runId}${String(orderSeq++).padStart(2, '0')}`, shippingCarrier: '顺丰速运' },
      });
      const completed = await api<any>(`/api/orders/${encodeURIComponent(order.orderNo)}/confirm`, {
        method: 'POST',
        token: account.token,
      });
      check(`${tag} 交付 → 确认收货（status=3）`, completed.status === 3, completed.status);
      orders.set(tag, order);
    }

    const idempotentReplay = await api<any>('/api/orders', {
      method: 'POST',
      token: accounts.get(BUYERS[0])!.token,
      idempotencyKey: orderKeys.get(BUYERS[0])!,
      body: { type: 1, packageId: PACKAGE_ID, useBalance: true },
    });
    check('同一幂等键重放返回同一订单（不重复下单）',
      idempotentReplay.orderNo === orders.get(BUYERS[0])!.orderNo,
      { first: orders.get(BUYERS[0])!.orderNo, replay: idempotentReplay.orderNo });

    const blockedRepurchase = await expectReject(
      '/api/orders',
      {
        method: 'POST',
        token: accounts.get(BUYERS[0])!.token,
        idempotencyKey: key('e2e-repurchase-blocked'),
        body: { type: 3, packageId: PACKAGE_ID, useBalance: true },
      },
      '权益通尚未用完',
    );
    check('权益通未用完时复消被拒绝', blockedRepurchase === '', blockedRepurchase);

    /* ---------- 5. 支付即生效：权益通 + 直推计划（先拆） ---------- */
    console.log('\n[5] 支付即生效：权益通 PV×3、直推奖先拆后分期');
    const directTotal = Math.round(P * directRate);
    const cashTotal = Math.round(directTotal * cashRatio);
    const tokenTotal = directTotal - cashTotal;
    const firstStage = Math.floor(cashTotal / periods);

    for (const tag of BUYERS) {
      const quota = await api<any>('/api/me/transfer-quota', { token: accounts.get(tag)!.token });
      check(`${tag} 权益通 = PV×3 = ${P * 3}`, num(quota.granted) === P * 3 && num(quota.available) === P * 3,
        { granted: num(quota.granted), available: num(quota.available) });
    }

    // 每位上级有 2 个下线各买 1 单 → 2 个直推计划、太阳值 2 份支付即到账
    const tokenAfterPurchase = new Map<string, number>();
    for (const parentTag of TWO_CHILD_PARENTS) {
      const token = await api<any>('/api/me/token', { token: accounts.get(parentTag)!.token });
      tokenAfterPurchase.set(parentTag, num(token.total));
      check(`${parentTag} 太阳值支付即到账 ${tokenTotal * 2}（2 份 × ${tokenTotal}）`,
        num(token.total) === tokenTotal * 2, num(token.total));
      const wallet = await api<any>('/api/me/wallet', { token: accounts.get(parentTag)!.token });
      check(`${parentTag} 钱包此时仍为 0（现金尚未释放）`, num(wallet.balance) === 0, num(wallet.balance));
    }

    const plans = await api<any>('/api/admin/bonus/plans', { token: admin.token });
    const buyerOrderNos = new Set(BUYERS.map((tag) => orders.get(tag)!.orderNo));
    const ourPlans = rows<any>(plans).filter((plan) => buyerOrderNos.has(plan.order?.orderNo));
    check(`直推计划数 = ${BUYERS.length}（每笔订单 1 个）`, ourPlans.length === BUYERS.length, ourPlans.length);
    check(`计划总额 = 现金部分 ${cashTotal}（不含太阳值）`,
      ourPlans.every((plan) => num(plan.totalAmount) === cashTotal),
      ourPlans.map((plan) => num(plan.totalAmount)));
    check('计划均已标记「先拆」完成（splitAt 非空）', ourPlans.every((plan) => plan.splitAt !== null),
      ourPlans.map((plan) => plan.splitAt));
    check(`每期现金 = 现金部分 ÷ ${periods} 期`,
      ourPlans.every((plan) => num(plan.dailyAmount) === firstStage),
      ourPlans.map((plan) => num(plan.dailyAmount)));

    /* ---------- 6. 日结（day1） ---------- */
    console.log(`\n[6] 每日结算（${day1}）`);
    const s1 = await settle(day1);
    check('日结跑满 11 步', s1.step === 11, s1);

    /* ---------- 7. 等级自动晋升 ---------- */
    console.log('\n[7] 等级自动晋升');
    for (const tag of REGISTER_ORDER) {
      const account = accounts.get(tag)!;
      const rank = await api<any>('/api/me/rank', { token: account.token });
      const level = expectedLevel(TEAM_AMOUNT[tag]);
      check(`${tag} 团队累计 ${TEAM_AMOUNT[tag]} → Lv${level}`,
        num(rank.totalPerformance) === TEAM_AMOUNT[tag] && rank.rankLevel === level,
        { performance: num(rank.totalPerformance), level: rank.rankLevel });
    }

    const bonusOf = async (tag: string, type: number): Promise<number> => {
      const result = await api<any>(`/api/me/bonus/records?type=${type}&page=1`, { token: accounts.get(tag)!.token });
      return sum(rows<any>(result));
    };

    /* ---------- 8. 团队奖 ---------- */
    console.log('\n[8] 团队奖 =（伞下当日 PV − 自己最大直推线）× 职级费率');
    for (const tag of REGISTER_ORDER) {
      const expected = teamBonusOf(tag);
      const actual = await bonusOf(tag, 2);
      check(`${tag} 团队奖 ${expected}（基数 ${effectiveBase(tag)}）`, actual === expected, actual);
    }

    /* ---------- 9. 平级奖 ---------- */
    console.log('\n[9] 平级奖：被剔除的直接推广关系不产生平级奖');
    for (const [parent, child] of PEER_EDGES) {
      const actual = await bonusOf(parent, 3);
      check(`${parent}→${child} 属该上级被剔除推广线，平级奖为 0`, actual === 0, actual);
    }
    const dPeer = await bonusOf('D', 3);
    check('D（Lv3）与上级 C（Lv4）不同级，平级奖为 0', dPeer === 0, dPeer);

    /* ---------- 10. 领导奖 ---------- */
    console.log('\n[10] 领导奖 = 未剔除直推下级的团队奖 × 50%');
    const leaderFor = (tag: string): number => {
      const children = TREE[tag];
      if (!children.length) return 0;
      const amounts = children.map((child) => teamBonusOf(child));
      // 剔除自己最大线：金额最大的一条（并列取靠前者，与日结一致）
      const maxIndex = amounts.indexOf(Math.max(...amounts));
      const kept = amounts.filter((_amount, index) => index !== maxIndex);
      return kept.reduce((total, amount) => total + Math.round(amount * 0.5), 0);
    };
    for (const tag of ['A', 'B', 'C', 'D', 'L1']) {
      const expected = leaderFor(tag);
      const actual = await bonusOf(tag, 4);
      check(`${tag} 领导奖 ${expected}`, actual === expected, actual);
    }

    /* ---------- 11. 分红池 ---------- */
    console.log('\n[11] 晋升参与分红（按各职级池人数平分）');
    const pools = rows<any>(await api<any[]>(`/api/admin/dividend/pools?date=${day1}`, { token: admin.token }));
    const snapOfLevel = (level: number): any =>
      pools.find((row) => row.rankId === rankIdByLevel.get(level));

    for (const [level, poolRate] of [...poolRateByLevel.entries()].sort((a, b) => a[0] - b[0])) {
      if (poolRate <= 0) continue;
      const snap = snapOfLevel(level);
      check(`Lv${level} 分红池已生成快照（池比例 ${poolRate}）`, !!snap, snap?.rankId);
      if (!snap) continue;
      check(`Lv${level} 池总额 = 当日全网业绩 ${num(snap.totalPerformance)} × ${poolRate}`,
        num(snap.poolAmount) === Math.round(num(snap.totalPerformance) * poolRate),
        { pool: num(snap.poolAmount), expect: Math.round(num(snap.totalPerformance) * poolRate) });
      check(`Lv${level} 人均 = 池总额 ÷ 人数（整数除法，余数沉淀）`,
        num(snap.perCapita) === Math.floor(num(snap.poolAmount) / Math.max(1, num(snap.userCount))),
        { perCapita: num(snap.perCapita), pool: num(snap.poolAmount), count: num(snap.userCount) });
    }

    /** 会员应得分红：按自己等级对应池的人均；池比例为 0 或池为空则为 0 */
    const expectedDividend = (tag: string): number => {
      const level = expectedLevel(TEAM_AMOUNT[tag]);
      const poolRate = poolRateByLevel.get(level) ?? 0;
      if (poolRate <= 0) return 0;
      const snap = snapOfLevel(level);
      if (!snap || num(snap.userCount) === 0) return 0;
      return Math.floor(num(snap.poolAmount) / num(snap.userCount));
    };
    for (const tag of REGISTER_ORDER) {
      const expected = expectedDividend(tag);
      const actual = await bonusOf(tag, 5);
      check(`${tag} 分红 ${expected}（Lv${expectedLevel(TEAM_AMOUNT[tag])}）`, actual === expected, actual);
    }

    /* ---------- 12. 次日日结：直推现金首期 ---------- */
    console.log(`\n[12] 直推奖分期释放（${day2}，第 1 期 = 现金部分 ÷ ${periods}）`);
    const walletBefore = new Map<string, number>();
    const tokenBeforeRelease = new Map<string, number>();
    for (const tag of TWO_CHILD_PARENTS) {
      const account = accounts.get(tag)!;
      const [wallet, token] = await Promise.all([
        api<any>('/api/me/wallet', { token: account.token }),
        api<any>('/api/me/token', { token: account.token }),
      ]);
      walletBefore.set(tag, num(wallet.balance));
      tokenBeforeRelease.set(tag, num(token.total));
    }
    const s2 = await settle(day2);
    check('次日日结跑满 11 步', s2.step === 11, s2);

    for (const tag of TWO_CHILD_PARENTS) {
      const wallet = await api<any>('/api/me/wallet', { token: accounts.get(tag)!.token });
      check(`${tag} 第 1 期现金 +${firstStage * 2}（2 份）`,
        num(wallet.balance) - (walletBefore.get(tag) ?? 0) === firstStage * 2,
        { before: walletBefore.get(tag), after: num(wallet.balance) });
      const token = await api<any>('/api/me/token', { token: accounts.get(tag)!.token });
      check(`${tag} 太阳值不随分期重复发放（释放前后不变）`,
        num(token.total) === tokenBeforeRelease.get(tag),
        { before: tokenBeforeRelease.get(tag), after: num(token.total) });
    }

    /* ---------- 13. 账务对账 ---------- */
    console.log('\n[13] 账务对账');
    const recon = await api<any>('/api/admin/settlements/reconcile', {
      method: 'POST',
      token: admin.token,
      body: { date: day1 },
    });
    for (const item of recon.checks as Array<{ name: string; ok: boolean }>) {
      check(`对账：${item.name}`, item.ok);
    }
    check('对账覆盖 ≥7 项且全部成立',
      recon.allPassed === true && (recon.checks as unknown[]).length >= 7, recon.checks);

    /* ---------- 14. 收益恒等式 ---------- */
    console.log('\n[14] 收益恒等式：累计收益 = 钱包 + 太阳值');
    for (const tag of REGISTER_ORDER) {
      const account = accounts.get(tag)!;
      const [summary, wallet, token] = await Promise.all([
        api<any>('/api/me/bonus', { token: account.token }),
        api<any>('/api/me/wallet', { token: account.token }),
        api<any>('/api/me/token', { token: account.token }),
      ]);
      check(`${tag} 累计收益 = 钱包 + 太阳值`,
        num(summary.total) === num(wallet.balance) + num(token.total),
        { total: num(summary.total), wallet: num(wallet.balance), token: num(token.total) });
    }

    /* ---------- 15. 太阳值互转（即时到账） ---------- */
    console.log('\n[15] 太阳值互转（即时到账）');
    const fromTag = 'A';
    const toTag = 'B';
    const from = accounts.get(fromTag)!;
    const to = accounts.get(toTag)!;
    await api('/api/me/realname', {
      method: 'POST',
      token: from.token,
      body: { realName: 'E2E 甲', idCard: '110101199001011237' },
    });
    await api(`/api/admin/members/${from.userId}/realname/review`, {
      method: 'POST',
      token: admin.token,
      body: { approved: true, remark: 'E2E 自动审核' },
    });
    await api('/api/me/transfer-password', {
      method: 'POST',
      token: from.token,
      body: { newPassword: '654321' },
    });

    const [fromBefore, toBefore] = await Promise.all([
      api<any>('/api/me/token', { token: from.token }),
      api<any>('/api/me/token', { token: to.token }),
    ]);
    const transferAmount = Math.min(100, Math.floor(num(fromBefore.total) / 2));
    check('转出方太阳值足以发起互转', transferAmount > 0, num(fromBefore.total));

    const transfer = await api<any>('/api/me/token/transfers', {
      method: 'POST',
      token: from.token,
      idempotencyKey: key('e2e-token-transfer'),
      body: { toPhone: to.phone, amount: transferAmount, paymentPassword: '654321', remark: 'E2E 太阳值互转' },
    });
    check('太阳值互转创建即完成（无需接收方确认）', transfer.status === 'COMPLETED', transfer);

    const [fromAfter, toAfter] = await Promise.all([
      api<any>('/api/me/token', { token: from.token }),
      api<any>('/api/me/token', { token: to.token }),
    ]);
    check(`${fromTag} 太阳值 -${transferAmount}`, num(fromBefore.total) - num(fromAfter.total) === transferAmount,
      { before: num(fromBefore.total), after: num(fromAfter.total) });
    check(`${toTag} 太阳值 +${transferAmount}`, num(toAfter.total) - num(toBefore.total) === transferAmount,
      { before: num(toBefore.total), after: num(toAfter.total) });
    check('互转守恒：双方余额合计不变',
      num(fromBefore.total) + num(toBefore.total) === num(fromAfter.total) + num(toAfter.total),
      { before: num(fromBefore.total) + num(toBefore.total), after: num(fromAfter.total) + num(toAfter.total) });
    check('转出方累计转出、接收方累计转入同步增长',
      num(fromAfter.transferOut) - num(fromBefore.transferOut) === transferAmount
      && num(toAfter.transferIn) - num(toBefore.transferIn) === transferAmount,
      { out: num(fromAfter.transferOut), in: num(toAfter.transferIn) });

    /* ---------- 16. 权益通：约束与复消前置 ---------- */
    console.log('\n[16] 权益通：转账额度口径');
    const quotaTag = 'L2';
    const quotaAccount = accounts.get(quotaTag)!;
    const quota = await api<any>('/api/me/transfer-quota', { token: quotaAccount.token });
    check(`${quotaTag} 权益通授权 ${P * 3}、可用 ${P * 3}、无需复消`,
      num(quota.granted) === P * 3 && num(quota.available) === P * 3 && quota.repurchaseRequired === false,
      { granted: num(quota.granted), available: num(quota.available), required: quota.repurchaseRequired });
    const quotaTx = await api<any>('/api/me/transfer-quota/transactions?page=1', { token: quotaAccount.token });
    check('权益通流水包含购卡发放记录',
      rows<any>(quotaTx).some((row) => row.type === 1 && num(row.changeAmount) === P * 3),
      rows<any>(quotaTx).slice(0, 2));

    await api('/api/me/transfer-password', {
      method: 'POST',
      token: quotaAccount.token,
      body: { newPassword: '654321' },
    });
    const noKeyQuota = await expectReject(
      '/api/me/wallet/transfers',
      { method: 'POST', token: quotaAccount.token, body: { toPhone: accounts.get('D')!.phone, amount: 1, paymentPassword: '654321' } },
      '幂等键',
    );
    check('转账缺少幂等键被拒绝', noKeyQuota === '', noKeyQuota);

    const notRealname = await expectReject(
      '/api/me/wallet/transfers',
      {
        method: 'POST',
        token: quotaAccount.token,
        idempotencyKey: key('e2e-quota-transfer'),
        body: { toPhone: accounts.get('D')!.phone, amount: 1, paymentPassword: '654321' },
      },
      '实名',
    );
    check('未实名发起钱包转账被拒绝', notRealname === '', notRealname);

    console.log(`\n=== 结果：${passed} 通过 / ${failed} 失败 ===`);
    if (failed > 0) {
      console.error(`失败项：\n- ${failures.join('\n- ')}`);
      process.exitCode = 1;
    }
  } finally {
    // 门槛恢复必须按 level 降序，否则会触发相邻等级校验失败
    for (const rank of [...ranks].sort((a, b) => b.level - a.level)) {
      const seed = SEED_THRESHOLDS[rank.level];
      if (seed === undefined) continue;
      try {
        await api(`/api/admin/ranks/${rank.id}`, { method: 'PUT', token: admin.token, body: { threshold: seed } });
      } catch (error) {
        console.error(`门槛恢复失败（Lv${rank.level}）：`, (error as Error).message);
      }
    }
    console.log('[✓] 等级门槛已恢复为种子值');
  }
}

main().catch((error) => {
  console.error('\nE2E 中断：', error);
  process.exitCode = 1;
});
