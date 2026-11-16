/**
 * 深层级 E2E：验证几百层伞下关系的注册、路径、业绩归集与奖金链路
 *
 * 背景：User.path 曾是 VarChar(1024)，第 257 层注册即因路径超长写入失败。
 * 现改为 Text（无长度上限）并在业务侧设 MAX_TREE_DEPTH=1000 上限。
 *
 * 场景：注册一条 R → L1 → L2 → … → L{DEPTH} 的直链（默认 300 层），
 *       在最深层下单产生业绩，日结后逐层核对：
 *         1. depth / parentId / path 结构正确
 *         2. 伞下人数（teamSize）逐层收敛：R = DEPTH，叶子 = 0
 *         3. 业绩沿链逐层归集：每层 totalPerformance 都等于订单金额
 *         4. 团队奖 / 平级奖 / 领导奖 / 直推奖在深层链上金额正确
 *         5. 5 项账务对账恒等式成立
 *
 * 用法：
 *   pnpm e2e:depth                 # 默认 300 层
 *   DEPTH=500 pnpm e2e:depth        # 500 层
 *   DEPTH=1001 pnpm e2e:depth       # 边界：第 1001 层应被上限拒绝（耗时较长）
 */
import 'dotenv/config';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const ADMIN_PHONE = process.env.E2E_ADMIN_PHONE ?? '13800138000';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '123456';
const DEPTH = Number(process.env.DEPTH ?? 300);

/** 上限与 relation.service.ts 的 MAX_TREE_DEPTH 保持一致 */
const MAX_TREE_DEPTH = 1000;
/** 至尊卡：价格 20000 */
const PACKAGE_ID = 4;
const ORDER_AMOUNT = 20000;
/** Lv1 种子门槛 5 万，脚本临时调到 1 万即可让全链晋升（全链仅 2 万业绩） */
const TEMP_LV1_THRESHOLD = 10000;
const SEED_LV1_THRESHOLD = 50000;

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
    // 日结为大批量操作，放宽头部超时
    signal: AbortSignal.timeout(600_000),
  });
  const json = (await res.json()) as { code: number; message: string; data: T };
  if (json.code !== 0) throw new Error(`${path} 返回错误: ${json.code} ${json.message}`);
  return json.data;
}

async function apiAllowFail<T = any>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ code: number; message: string; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    // 日结为大批量操作，放宽头部超时
    signal: AbortSignal.timeout(600_000),
  });
  return res.json() as Promise<{ code: number; message: string; data: T }>;
}

const num = (v: unknown): number => Number(v ?? 0);
const sum = (rows: Array<{ amount: unknown }>): number => rows.reduce((s, r) => s + num(r.amount), 0);

interface Account {
  tag: string;
  phone: string;
  token: string;
  userId: number;
  inviteCode: string;
  depth: number;
  path: string;
  parentId: number | null;
}

async function main(): Promise<void> {
  console.log(`=== 深层级 E2E（目标深度 ${DEPTH}，上限 ${MAX_TREE_DEPTH}）===\n`);

  /* ---------- 0. 管理员登录 ---------- */
  const admin = await api<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD },
  });
  console.log(`[0] 管理员已登录（${ADMIN_PHONE}）`);

  /* ---------- 1. 注册直链 R → L1 → … → L{DEPTH} ---------- */
  const targetDepth = Math.min(DEPTH, MAX_TREE_DEPTH);
  console.log(`\n[1] 注册 ${targetDepth + 1} 个账号的推荐直链`);
  const runId = String(Math.floor(Math.random() * 9000) + 1000);
  let seq = 0;
  const chain: Account[] = [];

  const registerOne = async (tag: string, inviteCode: string | null): Promise<Account> => {
    // 极端情况下随机 runId 可能与历史账号冲突，换号重试
    for (let attempt = 0; attempt < 5; attempt++) {
      const phone = `159${runId}${String(seq).padStart(4, '0')}`;
      const result = await apiAllowFail<{ token: string; user: { id: string } }>('/api/auth/register', {
        method: 'POST',
        body: { phone, password: '123456', nickname: `DEPTH-${tag}`, inviteCode: inviteCode ?? undefined },
      });
      if (result.code === 0) {
        seq += 1;
        const data = result.data;
        const me = await api<any>('/api/me', { token: data.token });
        return {
          tag,
          phone,
          token: data.token,
          userId: num(data.user.id),
          inviteCode: me.inviteCode,
          depth: num(me.depth),
          path: String(me.path),
          parentId: me.parentId === null ? null : num(me.parentId),
        };
      }
      if (result.message?.includes('已注册')) continue;
      throw new Error(`注册 ${tag} 失败: ${result.code} ${result.message}`);
    }
    throw new Error(`注册 ${tag} 失败：连续 5 次手机号冲突`);
  };

  // 根 R：无推荐人，depth 0
  const root = await registerOne('R', null);
  chain.push(root);
  check('R 为根节点（depth=0, parentId 空, path=","）',
    root.depth === 0 && root.parentId === null && root.path === ',', root);

  for (let i = 1; i <= targetDepth; i++) {
    const parent = chain[i - 1];
    const account = await registerOne(`L${i}`, parent.inviteCode);
    chain.push(account);

    // 逐层断言路径结构：path = ",R,L1,…,L(i-1),"
    const ancestors = account.path.split(',').filter(Boolean);
    const ok = account.depth === i
      && account.parentId === parent.userId
      && account.path.startsWith(',')
      && account.path.endsWith(',')
      && ancestors.length === i
      && ancestors[i - 1] === String(parent.userId);
    if (!ok) {
      check(`L${i} 路径结构正确`, false, {
        depth: account.depth, parentId: account.parentId, path: account.path, ancestors,
      });
      break;
    }
    if (i % 50 === 0 || i === targetDepth) {
      console.log(`  L${i} depth=${account.depth} pathLen=${account.path.length} ✓`);
    }
  }

  // 边界：超过上限时，下一层应被明确拒绝（而非静默写入脏数据）
  if (DEPTH > MAX_TREE_DEPTH) {
    const parent = chain[chain.length - 1];
    const probe = await apiAllowFail('/api/auth/register', {
      method: 'POST',
      body: {
        phone: `159${runId}${String(seq).padStart(4, '0')}`,
        password: '123456',
        nickname: 'DEPTH-overflow',
        inviteCode: parent.inviteCode,
      },
    });
    check(`第 ${MAX_TREE_DEPTH + 1} 层被上限拒绝（code=${probe.code}）`, probe.code !== 0, probe.message);
  }

  const deepest = chain[chain.length - 1];
  check(
    `成功注册到新深度 ${deepest.depth}（path 长度 ${deepest.path.length}，未断裂）`,
    deepest.depth === targetDepth,
    { depth: deepest.depth, pathLength: deepest.path.length },
  );

  /* ---------- 2. 伞下人数（teamSize） ---------- */
  console.log('\n[2] 伞下人数：根 = 链长，叶子 = 0');
  const rootMe = await api<any>('/api/me', { token: root.token });
  const leafMe = await api<any>('/api/me', { token: deepest.token });
  check(`R 的伞下人数 = ${chain.length - 1}`, num(rootMe.teamSize) === chain.length - 1, rootMe.teamSize);
  check('叶子伞下人数 = 0', num(leafMe.teamSize) === 0, leafMe.teamSize);

  /* ---------- 3. 临时调低 Lv1 门槛，让全链晋升以验证深层奖金 ---------- */
  const ranks = await api<any[]>('/api/admin/ranks', { token: admin.token });
  const lv1 = ranks.find((r) => r.level === 1);
  console.log(`\n[3] Lv1 门槛临时 ${num(lv1?.threshold)} → ${TEMP_LV1_THRESHOLD}`);
  await api(`/api/admin/ranks/${lv1.id}`, {
    method: 'PUT',
    token: admin.token,
    body: { threshold: TEMP_LV1_THRESHOLD },
  });

  const settle = async (date: string) => {
    const r = await api<any>('/api/admin/settlements/daily/rerun', {
      method: 'POST',
      token: admin.token,
      body: { date },
    });
    return r.result ?? r;
  };

  try {
    /* ---------- 4. 最深层下单产生业绩 ---------- */
    console.log('\n[4] 最深层下单（至尊卡 20000，权益值全额抵扣）');
    const day1 = new Date().toISOString().slice(0, 10);
    // 直推奖第 1 期 dueAt 为订单完成日的次日 UTC 16:00，需再往后一天结算才覆盖
    const day2 = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);

    await api(`/api/admin/equity/${deepest.userId}/adjust`, {
      method: 'POST',
      token: admin.token,
      body: { amount: ORDER_AMOUNT, reason: `深层 E2E 授予 L${deepest.depth} 购卡权益值` },
    });
    const order = await api<any>('/api/orders', {
      method: 'POST',
      token: deepest.token,
      body: { type: 1, packageId: PACKAGE_ID, useEquity: true, useBalance: false },
    });
    await api(`/api/admin/orders/${encodeURIComponent(order.orderNo)}/deliver`, {
      method: 'POST',
      token: admin.token,
    });
    await api(`/api/orders/${encodeURIComponent(order.orderNo)}/confirm`, {
      method: 'POST',
      token: deepest.token,
    });
    console.log(`  订单 ${order.orderNo} 已完成`);

    /* ---------- 5. 日结 ---------- */
    console.log(`\n[5] 每日结算（${day1}）`);
    const s1 = await settle(day1);
    check('日结跑满 11 步', s1.step === 11, s1);

    /* ---------- 6. 业绩沿链归集 ---------- */
    console.log('\n[6] 业绩归集：每层 totalPerformance 都等于订单金额');
    let aggOk = true;
    let aggBad: unknown = null;
    for (const account of chain) {
      const rank = await api<any>('/api/me/rank', { token: account.token });
      if (num(rank.totalPerformance) !== ORDER_AMOUNT || rank.rankLevel !== 1) {
        aggOk = false;
        aggBad = { tag: account.tag, total: num(rank.totalPerformance), level: rank.rankLevel };
        break;
      }
    }
    check(`全部 ${chain.length} 层 totalPerformance = ${ORDER_AMOUNT} 且晋升 Lv1`, aggOk, aggBad);

    /* ---------- 7. 深层链上的团队奖 / 平级奖 / 领导奖 ---------- */
    console.log('\n[7] 团队奖 / 平级奖 / 领导奖（深层链）');
    const configs = await api<Array<{ key: string; value: unknown }>>('/api/admin/configs', { token: admin.token });
    const cfg = new Map(configs.map((c) => [c.key, Number(c.value)]));
    const peerRate = cfg.get('bonus.peer_rate') ?? 1.0;
    const leaderRate = cfg.get('bonus.leader_rate') ?? 0.5;
    const teamRate = num(lv1?.teamRate ?? 0.03);
    const teamBonus = Math.round(ORDER_AMOUNT * teamRate);
    console.log(`  teamRate=${teamRate} peerRate=${peerRate} leaderRate=${leaderRate} 团队奖=${teamBonus}`);

    const bonusOf = async (tag: string, type: number): Promise<number> => {
      const account = chain.find((a) => a.tag === tag)!;
      const r = await api<any>(`/api/me/bonus/records?type=${type}&page=1`, { token: account.token });
      return sum(r.list ?? []);
    };

    // 每个节点（含叶子）团队奖相同：teamAmount 都是 20000
    for (const tag of ['R', 'L1', `L${Math.floor(targetDepth / 2)}`, `L${targetDepth}`]) {
      const actual = await bonusOf(tag, 2);
      check(`${tag} 团队奖 = ${teamBonus}`, actual === teamBonus, actual);
    }

    // 非叶子从唯一子节点获得平级奖 + 领导奖；叶子为 0
    const parentOfDeepest = chain[chain.length - 2];
    const leafPeer = await bonusOf(`L${targetDepth}`, 3);
    check(`L${targetDepth}（叶子）平级奖 = 0`, leafPeer === 0, leafPeer);
    const parentPeer = await bonusOf(parentOfDeepest.tag, 3);
    check(`${parentOfDeepest.tag} 平级奖 = ${Math.round(teamBonus * peerRate)}`,
      parentPeer === Math.round(teamBonus * peerRate), parentPeer);
    const parentLeader = await bonusOf(parentOfDeepest.tag, 4);
    check(`${parentOfDeepest.tag} 领导奖 = ${Math.round(teamBonus * leaderRate)}`,
      parentLeader === Math.round(teamBonus * leaderRate), parentLeader);
    const l1Peer = await bonusOf('L1', 3);
    check(`L1 平级奖 = ${Math.round(teamBonus * peerRate)}`, l1Peer === Math.round(teamBonus * peerRate), l1Peer);

    /* ---------- 8. 次日日结：直推奖分期释放 ---------- */
    console.log(`\n[8] 直推奖分期释放（${day2}，第 1 期 = ${ORDER_AMOUNT} ÷ 20）`);
    const s2 = await settle(day2);
    check('次日日结跑满 11 步', s2.step === 11, s2);
    const direct = await bonusOf(parentOfDeepest.tag, 1);
    check(`${parentOfDeepest.tag} 直推奖第 1 期 = ${ORDER_AMOUNT / 20}`, direct === ORDER_AMOUNT / 20, direct);

    /* ---------- 9. 对账 ---------- */
    console.log('\n[9] 账务对账');
    const recon = await api<any>('/api/admin/settlements/reconcile', {
      method: 'POST',
      token: admin.token,
      body: { date: day1 },
    });
    for (const item of recon.checks as Array<{ name: string; ok: boolean }>) {
      check(`对账：${item.name}`, item.ok);
    }
    check('5 项对账恒等式全部成立', recon.allPassed === true, recon.checks);

    console.log(`\n=== 结果：通过 ${passed} 项，失败 ${failed} 项 ===`);
  } finally {
    /* ---------- 恢复 Lv1 门槛 ---------- */
    console.log('\n[恢复] Lv1 门槛还原');
    await api(`/api/admin/ranks/${lv1.id}`, {
      method: 'PUT',
      token: admin.token,
      body: { threshold: SEED_LV1_THRESHOLD },
    }).catch((e) => console.error(`  恢复失败：${e.message}`));
    console.log(`  Lv1 → ${SEED_LV1_THRESHOLD}`);
  }

  if (failed > 0) {
    console.error('\n失败项：');
    for (const item of failures) console.error(`  - ${item}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('深层级 E2E 异常:', e);
  process.exit(1);
});
