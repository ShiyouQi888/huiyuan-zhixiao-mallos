/**
 * 端到端烟雾测试（PV 计酬 + 权益通 + 太阳值模型）
 *
 * 链路：登录 → 档位/开关 → 注册两级 → 下单（幂等键/余额校验）→ 支付即生效
 *      → 交付（快递单号）→ 确认收货 → 日结 → 直推奖「先拆后分期」释放
 *      → 对账 7 项 → 权益通耗尽 → 复消 → 普通商品复消（PV 累计 + 权益通 + 10% 直推奖）
 *
 * 用法：先启动 API，再执行 pnpm --filter @solar/api test:smoke
 * 说明：可重复执行（每次注册独立手机号）；日结会对当日全库数据重算，但不改历史已发奖金。
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const ADMIN_PHONE = process.env.SMOKE_ADMIN_PHONE ?? '13800138000';
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? '123456';
const PACKAGE_ID = 4;

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
    signal: AbortSignal.timeout(600_000),
  });
  const json = (await res.json()) as { code: number; message: string; data: T };
  if (json.code !== 0) throw new Error(`${path} 返回错误: ${json.code} ${json.message}`);
  return json.data;
}

const num = (value: unknown): number => Number(value ?? 0);
/** 列表接口有两种返回：裸数组或 { list, total } */
const rows = <T = any>(result: unknown): T[] =>
  Array.isArray(result) ? (result as T[]) : (((result as { list?: T[] } | null)?.list) ?? []);
const key = (scene: string): string => `${scene}-${randomUUID()}`;
const plusDays = (days: number): string => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

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
  console.log('=== 太阳线会员系统 · 烟雾测试（PV / 权益通 / 太阳值）===\n');

  /* ---------- 1. 基础配置 ---------- */
  const admin = await api<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD },
  });
  const adminMe = await api<any>('/api/me', { token: admin.token });
  console.log('[1] 管理员已登录');

  const packages = await api<any[]>('/api/admin/packages', { token: admin.token });
  const pkg = packages.find((item) => item.id === PACKAGE_ID);
  if (!pkg) throw new Error(`档位 ${PACKAGE_ID} 不存在，请先执行 pnpm --filter @solar/api prisma:seed`);
  const PRICE = num(pkg.price);
  const PV = num(pkg.pv);
  check('档位数量为 4 且 PV 单调递增',
    packages.length === 4 && packages.every((item, index) => index === 0 || num(item.pv) > num(packages[index - 1].pv)),
    packages.map((item) => `${item.name}:${item.pv}`));
  check(`测试档位 ${pkg.name} 价格 ${PRICE} / PV ${PV} 均为正数`, PRICE > 0 && PV > 0, { PRICE, PV });

  const configs = await api<any[]>('/api/admin/configs', { token: admin.token });
  const configValue = (configKey: string, fallback: number): number => {
    const row = configs.find((item) => item.key === configKey);
    const parsed = Number(row?.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const cashRatio = configValue('bonus.cash_ratio', 0.7);
  const rewardRate = configValue('bonus.reward_rate', 1.0);
  const repurchaseRate = configValue('bonus.repurchase_rate', 0.1);
  const defaultPeriods = configValue('bonus.direct_periods', 20);
  const directRate = pkg.directRewardRate === null || pkg.directRewardRate === undefined
    ? rewardRate : Number(pkg.directRewardRate);
  const repurchaseRewardRate = pkg.repurchaseRewardRate === null || pkg.repurchaseRewardRate === undefined
    ? repurchaseRate : Number(pkg.repurchaseRewardRate);
  const periods = pkg.directReleaseDays === null || pkg.directReleaseDays === undefined
    ? defaultPeriods : Number(pkg.directReleaseDays);

  const features = await api<{ features: Array<{ code: string }> }>('/api/features?platform=h5', { token: admin.token });
  const codes = new Set(features.features.map((item) => item.code));
  check('功能开关下发礼包/权益通/太阳值/转账入口',
    ['package.purchase', 'wallet.transfer_quota', 'token.view', 'token.transfer', 'wallet.transfer', 'transfer.password']
      .every((code) => codes.has(code)),
    [...codes]);
  check('未实现功能不下发（消息订阅/客服）',
    !codes.has('notify.subscribe') && !codes.has('customer.service'), [...codes]);

  /* ---------- 2. 注册 ---------- */
  const runId = String(Date.now()).slice(-8);
  const parentPhone = `133${runId}`;
  const childPhone = `134${runId}`;
  const parentReg = await api<{ token: string; user: { id: string } }>('/api/auth/register', {
    method: 'POST',
    body: { phone: parentPhone, password: 'Smoke2026', nickname: 'SM-上级', inviteCode: adminMe.inviteCode },
  });
  const parentMe = await api<any>('/api/me', { token: parentReg.token });
  const childReg = await api<{ token: string; user: { id: string } }>('/api/auth/register', {
    method: 'POST',
    body: { phone: childPhone, password: 'Smoke2026', nickname: 'SM-下线', inviteCode: parentMe.inviteCode },
  });
  const childMe = await api<any>('/api/me', { token: childReg.token });
  console.log(`\n[2] 上级 ${parentPhone} / 下线 ${childPhone}`);
  check('下线推荐人 = 上级', BigInt(childMe.parentId ?? 0) === BigInt(parentReg.user.id), childMe.parentId);

  /* ---------- 3. 下单约束 ---------- */
  console.log('\n[3] 下单约束与支付即生效');
  const noKey = await expectReject(
    '/api/orders',
    { method: 'POST', token: childReg.token, body: { type: 1, packageId: PACKAGE_ID, useBalance: true } },
    '幂等键',
  );
  check('下单缺少幂等键被拒绝', noKey === '', noKey);

  const noBalance = await expectReject(
    '/api/orders',
    {
      method: 'POST',
      token: childReg.token,
      idempotencyKey: key('smoke-nobalance'),
      body: { type: 1, packageId: PACKAGE_ID, useBalance: true },
    },
    '现金支付',
  );
  check('钱包余额不足时拒绝（系统无现金支付通道）', noBalance === '', noBalance);

  await api(`/api/admin/wallets/${childReg.user.id}/adjust`, {
    method: 'POST',
    token: admin.token,
    idempotencyKey: key('smoke-wallet'),
    body: { amount: PRICE, reason: 'SMOKE 充值购卡' },
  });

  const orderKey = key('smoke-order');
  const order = await api<any>('/api/orders', {
    method: 'POST',
    token: childReg.token,
    idempotencyKey: orderKey,
    body: { type: 1, packageId: PACKAGE_ID, useBalance: true },
  });
  check(`下单成功：订单 ${order.orderNo} 状态为已支付`, order.status === 1 && !!order.paidAt, order.status);
  check(`订单 PV 快照 = 档位 PV ${PV}`, num(order.pvAmount) === PV, num(order.pvAmount));
  check('钱包全额抵扣、现金与权益值抵扣均为 0',
    num(order.balanceDeduct) === PRICE && num(order.equityDeduct) === 0 && num(order.cashPay) === 0,
    { balance: num(order.balanceDeduct), equity: num(order.equityDeduct), cash: num(order.cashPay) });

  const replay = await api<any>('/api/orders', {
    method: 'POST',
    token: childReg.token,
    idempotencyKey: orderKey,
    body: { type: 1, packageId: PACKAGE_ID, useBalance: true },
  });
  check('同一幂等键重放返回同一订单', replay.orderNo === order.orderNo, replay.orderNo);

  const childQuota = await api<any>('/api/me/transfer-quota', { token: childReg.token });
  check(`下线权益通按 PV×3 发放 = ${PV * 3}`,
    num(childQuota.granted) === PV * 3 && num(childQuota.available) === PV * 3,
    { granted: num(childQuota.granted), available: num(childQuota.available) });

  /* ---------- 4. 直推奖「先拆」 ---------- */
  const directTotal = Math.round(PV * directRate);
  const expectCash = Math.round(directTotal * cashRatio);
  const expectToken = directTotal - expectCash;
  const parentToken = await api<any>('/api/me/token', { token: parentReg.token });
  const parentWallet = await api<any>('/api/me/wallet', { token: parentReg.token });
  check(`上级太阳值支付即到账 ${expectToken}`, num(parentToken.total) === expectToken, num(parentToken.total));
  check('上级钱包此时为 0（现金尚未释放）', num(parentWallet.balance) === 0, num(parentWallet.balance));

  const plans = await api<any[]>('/api/admin/bonus/plans', { token: admin.token });
  const plan = plans.find((item) => item.order?.orderNo === order.orderNo);
  check('直推奖计划已生成且标记为「先拆」完成', !!plan && plan.splitAt !== null, plan?.splitAt);
  check(`计划总额 = 现金部分 ${expectCash}（不含太阳值）`,
    !!plan && num(plan.totalAmount) === expectCash, num(plan?.totalAmount));
  check(`每期现金 = 现金部分 ÷ ${periods} 期`,
    !!plan && num(plan.dailyAmount) === Math.floor(expectCash / periods),
    { daily: num(plan?.dailyAmount), periods: num(plan?.periods) });

  /* ---------- 5. 交付与确认 ---------- */
  console.log('\n[5] 交付与确认');
  const noTracking = await expectReject(
    `/api/admin/orders/${encodeURIComponent(order.orderNo)}/deliver`,
    { method: 'POST', token: admin.token, body: {} },
    '快递单号',
  );
  check('交付必须填写快递单号', noTracking === '', noTracking);

  const delivered = await api<any>(`/api/admin/orders/${encodeURIComponent(order.orderNo)}/deliver`, {
    method: 'POST',
    token: admin.token,
    body: { trackingNo: `SF${runId}`, shippingCarrier: '顺丰速运' },
  });
  check('交付成功：状态转为已发货并写入物流信息',
    delivered.status === 2 && delivered.trackingNo === `SF${runId}` && delivered.shippingCarrier === '顺丰速运',
    { status: delivered.status, trackingNo: delivered.trackingNo });

  const completed = await api<any>(`/api/orders/${encodeURIComponent(order.orderNo)}/confirm`, {
    method: 'POST',
    token: childReg.token,
  });
  check('会员确认收货：状态转为已完成', completed.status === 3, completed.status);

  /* ---------- 6. 日结与分期释放 ---------- */
  const settleDate = plusDays(0);
  const releaseDate = plusDays(1);
  const settle = async (date: string) => {
    const result = await api<any>('/api/admin/settlements/daily/rerun', {
      method: 'POST',
      token: admin.token,
      body: { date },
    });
    return result.result ?? result;
  };
  console.log(`\n[6] 日结 ${settleDate} → 次日 ${releaseDate}`);
  const s1 = await settle(settleDate);
  check('当日日结跑满 11 步', s1.step === 11, s1);

  // 当日日结可能给上级带来团队/平级/领导/分红等其他收益，
  // 因此第 1 期释放必须用「日结前后的增量」断言，而不是绝对值。
  const walletBeforeRelease = await api<any>('/api/me/wallet', { token: parentReg.token });
  const tokenBeforeRelease = await api<any>('/api/me/token', { token: parentReg.token });
  const s2 = await settle(releaseDate);
  check('次日日结跑满 11 步', s2.step === 11, s2);

  const firstStage = Math.floor(expectCash / periods);
  const parentWallet2 = await api<any>('/api/me/wallet', { token: parentReg.token });
  const parentToken2 = await api<any>('/api/me/token', { token: parentReg.token });
  check(`第 1 期现金入钱包 +${firstStage}`,
    num(parentWallet2.balance) - num(walletBeforeRelease.balance) === firstStage,
    { before: num(walletBeforeRelease.balance), after: num(parentWallet2.balance) });
  check(`太阳值不随分期重复发放（仍为 ${num(tokenBeforeRelease.total)}）`,
    num(parentToken2.total) === num(tokenBeforeRelease.total),
    { before: num(tokenBeforeRelease.total), after: num(parentToken2.total) });

  /* ---------- 7. 账务对账 ---------- */
  console.log('\n[7] 账务对账');
  const recon = await api<any>('/api/admin/settlements/reconcile', {
    method: 'POST',
    token: admin.token,
    body: { date: settleDate },
  });
  for (const item of recon.checks as Array<{ name: string; ok: boolean }>) {
    check(`对账：${item.name}`, item.ok);
  }
  check('对账覆盖 ≥6 项且全部成立',
    recon.allPassed === true && (recon.checks as unknown[]).length >= 6, recon.checks);

  /* ---------- 8. 收益口径 ---------- */
  const summary = await api<any>('/api/me/bonus', { token: parentReg.token });
  check('累计收益 = 钱包 + 太阳值',
    num(summary.total) === num(parentWallet2.balance) + num(parentToken2.total),
    { total: num(summary.total), wallet: num(parentWallet2.balance), token: num(parentToken2.total) });

  /* ---------- 9. 权益通生命周期：耗尽 → 复消 ---------- */
  console.log('\n[9] 权益通：未用完不可复消 → 钱包转出耗尽 → 复消恢复');
  const repurchaseBlocked = await expectReject(
    '/api/orders',
    {
      method: 'POST',
      token: childReg.token,
      idempotencyKey: key('smoke-repurchase-blocked'),
      body: { type: 3, packageId: PACKAGE_ID, useBalance: true },
    },
    '权益通尚未用完',
  );
  check('权益通未用完时复消被拒绝', repurchaseBlocked === '', repurchaseBlocked);

  await api('/api/me/realname', {
    method: 'POST',
    token: childReg.token,
    body: { realName: '烟雾下线', idCard: '110101199001011237' },
  });
  await api(`/api/admin/members/${childReg.user.id}/realname/review`, {
    method: 'POST',
    token: admin.token,
    body: { approved: true, remark: 'SMOKE 自动审核' },
  });
  await api('/api/me/transfer-password', {
    method: 'POST',
    token: childReg.token,
    body: { newPassword: '654321' },
  });

  const quotaAmount = PV * 3;
  await api(`/api/admin/wallets/${childReg.user.id}/adjust`, {
    method: 'POST',
    token: admin.token,
    idempotencyKey: key('smoke-quota-wallet'),
    body: { amount: quotaAmount, reason: 'SMOKE 充值用于消耗权益通' },
  });
  const transfer = await api<any>('/api/me/wallet/transfers', {
    method: 'POST',
    token: childReg.token,
    idempotencyKey: key('smoke-wallet-transfer'),
    body: { toPhone: parentPhone, amount: quotaAmount, paymentPassword: '654321', remark: 'SMOKE 耗尽权益通' },
  });
  check('钱包转账创建成功（额度已预占）', !!transfer.transferNo && transfer.status === 'PENDING', transfer);

  if (transfer.riskFlag === 1) {
    const list = await api<any>('/api/admin/transfers?page=1', { token: admin.token });
    const target = rows(list).find((row) => row.transferNo === transfer.transferNo);
    check('风控命中后转账出现在管理端待复核列表', !!target, transfer.transferNo);
    await api(`/api/admin/transfers/${target?.id ?? 0}/review`, {
      method: 'POST',
      token: admin.token,
      body: { action: 'APPROVE', platform: 'wallet' },
    });
  } else {
    const list = await api<any>('/api/me/transfers/wallet?page=1', { token: parentReg.token });
    const incoming = rows(list).find((row) => row.transferNo === transfer.transferNo);
    check('待确认转账出现在接收方列表', !!incoming, transfer.transferNo);
    await api(`/api/me/wallet/transfers/${incoming?.id ?? 0}/accept`, { method: 'POST', token: parentReg.token });
  }

  const childQuota2 = await api<any>('/api/me/transfer-quota', { token: childReg.token });
  check(`权益通耗尽：已用 ${quotaAmount}、可用 0、需复消`,
    num(childQuota2.used) === quotaAmount && num(childQuota2.available) === 0 && childQuota2.repurchaseRequired === true,
    { used: num(childQuota2.used), available: num(childQuota2.available), required: childQuota2.repurchaseRequired });

  const tokenBeforeRepurchase = await api<any>('/api/me/token', { token: parentReg.token });
  await api(`/api/admin/wallets/${childReg.user.id}/adjust`, {
    method: 'POST',
    token: admin.token,
    idempotencyKey: key('smoke-repurchase-wallet'),
    body: { amount: PRICE, reason: 'SMOKE 充值复消' },
  });
  const repurchase = await api<any>('/api/orders', {
    method: 'POST',
    token: childReg.token,
    idempotencyKey: key('smoke-repurchase'),
    body: { type: 3, packageId: PACKAGE_ID, useBalance: true },
  });
  check('权益通耗尽后复消成功', repurchase.status === 1 && repurchase.type === 3, repurchase.status);

  const childQuota3 = await api<any>('/api/me/transfer-quota', { token: childReg.token });
  check(`复消后权益通再次发放 PV×3 = ${PV * 3}`,
    num(childQuota3.granted) === PV * 6 && num(childQuota3.available) === PV * 3,
    { granted: num(childQuota3.granted), available: num(childQuota3.available) });

  const repurchaseTotal = Math.round(PV * repurchaseRewardRate);
  const repurchaseCash = Math.round(repurchaseTotal * cashRatio);
  const repurchaseToken = repurchaseTotal - repurchaseCash;
  const parentToken3 = await api<any>('/api/me/token', { token: parentReg.token });
  check(`复消直推奖同样先拆：太阳值 +${repurchaseToken}`,
    num(parentToken3.total) - num(tokenBeforeRepurchase.total) === repurchaseToken,
    { before: num(tokenBeforeRepurchase.total), after: num(parentToken3.total), expectAdd: repurchaseToken });

  const plansAfter = await api<any[]>('/api/admin/bonus/plans', { token: admin.token });
  const repurchasePlan = plansAfter.find((item) => item.order?.orderNo === repurchase.orderNo);
  check(`复消直推计划：现金部分 ${repurchaseCash}（复消直推比例 ${repurchaseRewardRate}）`,
    !!repurchasePlan && num(repurchasePlan.totalAmount) === repurchaseCash && repurchasePlan.splitAt !== null,
    { total: num(repurchasePlan?.totalAmount), splitAt: repurchasePlan?.splitAt });

  /* ---------- 10. 普通商品复消：PV 累计 + 权益通 + 10% 直推奖 ---------- */
  console.log('\n[10] 普通商品订单（复消）：PV 累计 + 权益通 PV×3 + 10% 直推奖');

  const zeroPvCreate = await expectReject(
    '/api/admin/catalog/products',
    {
      method: 'POST',
      token: admin.token,
      body: { name: `SMOKE 零PV商品 ${runId}`, price: 199, pv: 0, stock: 1, status: 0 },
    },
    '商品PV须为大于 0',
  );
  check('商品 PV=0 创建被拒绝', zeroPvCreate === '', zeroPvCreate);

  const productsForOrder = rows<any>(await api('/api/admin/catalog/products?status=1&page=1', { token: admin.token }));
  const product = productsForOrder.find((item) => {
    const binds = rows<any>(item.packageBinds);
    return num(item.status) === 1 && num(item.pv) > 0 && num(item.stock) >= 1
      && (binds.length === 0 || binds.some((bind) => Number(bind.packageId) === PACKAGE_ID));
  });
  if (!product) throw new Error('没有可用的上架商品（PV>0 且库存≥1），请先执行 pnpm --filter @solar/api prisma:seed');

  const zeroPvUpdate = await expectReject(
    `/api/admin/catalog/products/${product.id}`,
    { method: 'PUT', token: admin.token, body: { pv: 0 } },
    '商品PV须为大于 0',
  );
  check('商品 PV 改成 0 被拒绝', zeroPvUpdate === '', zeroPvUpdate);

  const productPv = num(product.pv);
  const productBind = rows<any>(product.packageBinds).find((bind) => Number(bind.packageId) === PACKAGE_ID);
  const unitPrice = productBind?.exclusivePrice === null || productBind?.exclusivePrice === undefined
    ? num(product.price) : num(productBind.exclusivePrice);

  const address = await api<any>('/api/me/addresses', {
    method: 'POST',
    token: childReg.token,
    body: { receiver: '烟雾收货人', phone: childPhone, province: '广东省', city: '深圳市', district: '南山区', detail: '科技园 1 号', isDefault: true },
  });
  await api(`/api/admin/wallets/${childReg.user.id}/adjust`, {
    method: 'POST',
    token: admin.token,
    idempotencyKey: key('smoke-product-wallet'),
    body: { amount: unitPrice, reason: 'SMOKE 充值购买普通商品' },
  });

  const quotaBeforeProduct = await api<any>('/api/me/transfer-quota', { token: childReg.token });
  const tokenBeforeProduct = await api<any>('/api/me/token', { token: parentReg.token });
  const productOrder = await api<any>('/api/orders', {
    method: 'POST',
    token: childReg.token,
    idempotencyKey: key('smoke-product-order'),
    body: { type: 4, productId: String(product.id), quantity: 1, addressId: String(address.id), useBalance: true },
  });
  check(`商品订单支付成功并累计 PV ${productPv}`,
    productOrder.type === 4 && num(productOrder.pvAmount) === productPv && num(productOrder.amount) === unitPrice,
    { type: productOrder.type, pvAmount: num(productOrder.pvAmount), amount: num(productOrder.amount) });
  check('已购卡会员的商品订单标记为复消', productOrder.isRepurchase === true, productOrder.isRepurchase);

  const productDetailOrder = await api<any>(`/api/orders/${productOrder.orderNo}`, { token: childReg.token });
  check(`商品订单业绩已落库（OrderPerformance = ${productPv}）`,
    num(productDetailOrder.performance?.amount) === productPv,
    { performance: productDetailOrder.performance?.amount });

  const quotaAfterProduct = await api<any>('/api/me/transfer-quota', { token: childReg.token });
  check(`商品复消发放权益通 PV×3 = ${productPv * 3}`,
    num(quotaAfterProduct.granted) - num(quotaBeforeProduct.granted) === productPv * 3,
    { before: num(quotaBeforeProduct.granted), after: num(quotaAfterProduct.granted) });

  const productBonusTotal = Math.round(productPv * repurchaseRewardRate);
  const productBonusCash = Math.round(productBonusTotal * cashRatio);
  const productBonusToken = productBonusTotal - productBonusCash;
  const tokenAfterProduct = await api<any>('/api/me/token', { token: parentReg.token });
  check(`商品复消直推奖先拆：太阳值 +${productBonusToken}（总额 ${productBonusTotal} 的 30% 部分）`,
    num(tokenAfterProduct.total) - num(tokenBeforeProduct.total) === productBonusToken,
    { before: num(tokenBeforeProduct.total), after: num(tokenAfterProduct.total), expectAdd: productBonusToken });

  const productPlan = rows<any>(await api('/api/admin/bonus/plans', { token: admin.token }))
    .find((item) => item.order?.orderNo === productOrder.orderNo);
  check(`商品复消直推计划：现金部分 ${productBonusCash}（比例 ${repurchaseRewardRate}）+ 分期 ${defaultPeriods} 期`,
    !!productPlan && num(productPlan.totalAmount) === productBonusCash
      && productPlan.splitAt !== null && Number(productPlan.periods) === defaultPeriods,
    { total: num(productPlan?.totalAmount), periods: productPlan?.periods, splitAt: productPlan?.splitAt });

  console.log(`\n=== 结果：${passed} 通过 / ${failed} 失败 ===`);
  if (failed > 0) {
    console.error(`失败项：\n- ${failures.join('\n- ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\n烟雾测试中断：', error);
  process.exitCode = 1;
});
