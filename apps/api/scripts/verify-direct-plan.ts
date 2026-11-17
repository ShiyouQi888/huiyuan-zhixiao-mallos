/**
 * 直推奖「先拆，后分期」专项验证
 * 用法：先启动 API，再执行 pnpm --filter @solar/api test:direct
 *
 * 覆盖规则：
 *   1. 支付成功即按 bonus.cash_ratio 拆出「现金部分」与「太阳值部分」；
 *   2. 太阳值部分一次性入账，不进分期；
 *   3. 现金部分按释放期数均分，余数补最后一期，Σ各期 === 现金部分总额；
 *   4. 次日日结只释放现金，不再二次拆分（钱包 +太阳值 恒等于直推奖总额）。
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const PACKAGE_ID = 4;
const ADMIN_PHONE = '13800138000';
const ADMIN_PASSWORD = '123456';

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail ?? '');
  }
}

async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      // 下单接口要求幂等键；每次调用使用独立键
      ...(method === 'POST' ? { 'x-idempotency-key': `verify-direct-${randomUUID()}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(600_000),
  });
  const json = (await res.json()) as { code: number; message: string; data: T };
  if (json.code !== 0) throw new Error(`${path} 返回错误: ${json.code} ${json.message}`);
  return json.data;
}

const num = (v: unknown): number => Number(v ?? 0);

async function main(): Promise<void> {
  console.log('=== 直推奖「先拆，后分期」专项验证 ===\n');

  const admin = await api<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD },
  });
  const adminMe = await api<any>('/api/me', { token: admin.token });

  /* ---------- 1. 规则参数（全部来自库内真实配置） ---------- */
  const configs = await prisma.config.findMany({
    where: { key: { in: ['bonus.cash_ratio', 'bonus.reward_rate', 'bonus.direct_periods'] } },
  });
  const configValue = (key: string, fallback: number): number => {
    const row = configs.find((item) => item.key === key);
    const parsed = Number(row?.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const cashRatio = configValue('bonus.cash_ratio', 0.7);
  const rewardRate = configValue('bonus.reward_rate', 1.0);
  const defaultPeriods = configValue('bonus.direct_periods', 20);

  const pkg = await prisma.package.findUniqueOrThrow({ where: { id: PACKAGE_ID } });
  const rate = Number(pkg.directRewardRate ?? rewardRate);
  const periods = Number(pkg.directReleaseDays ?? defaultPeriods);
  const total = Number(pkg.pv) * rate;
  const expectCash = Math.round(total * cashRatio);
  const expectToken = Math.round(total) - expectCash;
  const base = Math.floor(expectCash / periods);
  const remainder = expectCash - base * periods;
  console.log(`[1] ${pkg.name}：PV ${pkg.pv} × 直推比例 ${rate} = ${total}`);
  console.log(`    现金比例 ${cashRatio} → 现金 ${expectCash}（${periods} 期，每期 ${base}${remainder ? `，末期 +${remainder}` : ''}）/ 太阳值 ${expectToken}`);

  /* ---------- 2. 注册上级 + 下线 ---------- */
  const suffix = String(Date.now()).slice(-8);
  const parentPhone = `135${suffix}`;
  const childPhone = `136${suffix}`;
  const parentReg = await api<{ token: string; user: { id: string } }>('/api/auth/register', {
    method: 'POST',
    body: { phone: parentPhone, password: 'Verify2026', nickname: 'VP-上级', inviteCode: adminMe.inviteCode },
  });
  const parentMe = await api<any>('/api/me', { token: parentReg.token });
  const childReg = await api<{ token: string; user: { id: string } }>('/api/auth/register', {
    method: 'POST',
    body: { phone: childPhone, password: 'Verify2026', nickname: 'VP-下线', inviteCode: parentMe.inviteCode },
  });
  const parentId = BigInt(parentReg.user.id);
  const childMe = await api<any>('/api/me', { token: childReg.token });
  console.log(`\n[2] 上级 ${parentPhone} / 下线 ${childPhone}（推荐关系已绑定）`);
  check('下线推荐人指向上级', childMe.parentId !== null && BigInt(childMe.parentId) === parentId, childMe.parentId);

  const tokenBefore = await api<any>('/api/me/token', { token: parentReg.token });
  const walletBefore = await api<any>('/api/me/wallet', { token: parentReg.token });
  check('上级初始太阳值 / 钱包均为 0', num(tokenBefore.total) === 0 && num(walletBefore.balance) === 0,
    { token: num(tokenBefore.total), wallet: num(walletBefore.balance) });

  /* ---------- 3. 下线购卡（钱包全额支付） ---------- */
  await api(`/api/admin/wallets/${childReg.user.id}/adjust`, {
    method: 'POST',
    token: admin.token,
    body: { amount: Number(pkg.price), reason: 'VP 验证充值购卡' },
  });
  const order = await api<any>('/api/orders', {
    method: 'POST',
    token: childReg.token,
    body: { type: 1, packageId: PACKAGE_ID, useBalance: true },
  });
  console.log(`\n[3] 下线购卡订单 ${order.orderNo} 已支付`);

  /* ---------- 4. 计划：先拆（现金 / 太阳值），后分期（余数补末期） ---------- */
  const plan = await prisma.bonusPlan.findUniqueOrThrow({
    where: { orderId: BigInt(order.id) },
    include: { stages: { orderBy: { periodNo: 'asc' } } },
  });
  const stageSum = plan.stages.reduce((acc, stage) => acc + Number(stage.amount), 0);

  check('计划标记为「先拆」完成（splitAt 非空）', plan.splitAt !== null, plan.splitAt);
  check(`计划总额 = 现金部分 ${expectCash}`, Number(plan.totalAmount) === expectCash, Number(plan.totalAmount));
  check(`释放期数 = ${periods}`, plan.periods === periods, plan.periods);
  check(`各期之和 = 现金部分（无余数丢失）`, stageSum === expectCash, { stageSum, expectCash });
  check(`前 ${periods - 1} 期均为基数 ${base}`,
    plan.stages.slice(0, -1).every((stage) => Number(stage.amount) === base),
    plan.stages.map((s) => Number(s.amount)));
  check(`末期 = 基数 + 余数 = ${base + remainder}`,
    Number(plan.stages[periods - 1].amount) === base + remainder, Number(plan.stages[periods - 1].amount));
  check('日均金额（展示用）= 基数', Number(plan.dailyAmount) === base, Number(plan.dailyAmount));

  /* ---------- 5. 太阳值一次性入账（支付即到账，不参与分期） ---------- */
  const tokenRecord = await prisma.bonusRecord.findFirstOrThrow({
    where: { planId: plan.id, type: 1, stageId: null },
  });
  const tokenLot = await prisma.tokenLot.findFirst({ where: { sourceBonusId: tokenRecord.id } });
  const tokenAfter = await api<any>('/api/me/token', { token: parentReg.token });

  check(`太阳值部分记录 = ${expectToken}`, Number(tokenRecord.amount) === expectToken, Number(tokenRecord.amount));
  check('太阳值记录只记太阳值、不进钱包',
    Number(tokenRecord.cashAmount) === 0 && Number(tokenRecord.tokenAmount) === expectToken,
    { cash: Number(tokenRecord.cashAmount), token: Number(tokenRecord.tokenAmount) });
  check('太阳值记录不挂钱包流水', tokenRecord.walletTransactionId === null, tokenRecord.walletTransactionId);
  check(`太阳值批次已生成（${expectToken}）`, !!tokenLot && Number(tokenLot.amount) === expectToken,
    tokenLot ? Number(tokenLot.amount) : null);
  check(`上级太阳值余额 = ${expectToken}（支付即到账）`, num(tokenAfter.total) === expectToken, num(tokenAfter.total));
  const walletMid = await api<any>('/api/me/wallet', { token: parentReg.token });
  check('上级钱包此时仍为 0（现金尚未释放）', num(walletMid.balance) === 0, num(walletMid.balance));

  /* ---------- 6. 次日日结：只释放现金第 1 期 ---------- */
  const settleDate = plan.startAt.toISOString().slice(0, 10);
  console.log(`\n[6] 日结 ${settleDate}（第 1 期到期）`);
  const settle = await api<any>('/api/admin/settlements/daily/rerun', {
    method: 'POST',
    token: admin.token,
    body: { date: settleDate },
  });
  check('日结跑满 11 步', (settle.result ?? settle).step === 11, settle);

  const firstStage = plan.stages[0];
  const stageRecord = await prisma.bonusRecord.findFirst({
    where: { planId: plan.id, stageId: firstStage.id },
  });
  const walletAfter = await api<any>('/api/me/wallet', { token: parentReg.token });
  const tokenFinal = await api<any>('/api/me/token', { token: parentReg.token });
  const planAfter = await prisma.bonusPlan.findUniqueOrThrow({ where: { id: plan.id } });

  check(`第 1 期现金入钱包 ${base}`, num(walletAfter.balance) === Number(firstStage.amount), num(walletAfter.balance));
  check('第 1 期记账全部计为现金（未二次拆分）',
    !!stageRecord && Number(stageRecord.cashAmount) === Number(firstStage.amount) && Number(stageRecord.tokenAmount) === 0,
    stageRecord ? { cash: Number(stageRecord.cashAmount), token: Number(stageRecord.tokenAmount) } : null);
  check(`太阳值不随分期重复发放（仍为 ${expectToken}）`, num(tokenFinal.total) === expectToken, num(tokenFinal.total));
  check('计划已释放金额 = 第 1 期', Number(planAfter.releasedAmount) === Number(firstStage.amount), Number(planAfter.releasedAmount));

  /* ---------- 7. 恒等式：钱包 + 太阳值 = 已发直推奖 ---------------------------- */
  const summary = await api<any>('/api/me/bonus', { token: parentReg.token });
  check('累计收益 = 钱包 + 太阳值',
    num(summary.total) === num(walletAfter.balance) + num(tokenFinal.total),
    { total: num(summary.total), wallet: num(walletAfter.balance), token: num(tokenFinal.total) });
  check('已发直推奖 = 太阳值部分 + 已释放现金',
    num(summary.total) === expectToken + Number(planAfter.releasedAmount),
    { total: num(summary.total), expect: expectToken + Number(planAfter.releasedAmount) });

  /* ---------- 8. 幂等：重复日结不重复释放 ---------- */
  await api('/api/admin/settlements/daily/rerun', {
    method: 'POST',
    token: admin.token,
    body: { date: settleDate },
  });
  const walletAgain = await api<any>('/api/me/wallet', { token: parentReg.token });
  check('重跑日结不会重复释放第 1 期', num(walletAgain.balance) === num(walletAfter.balance), num(walletAgain.balance));

  console.log(`\n=== 结果：${passed} 通过 / ${failed} 失败 ===`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('\n验证中断：', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
