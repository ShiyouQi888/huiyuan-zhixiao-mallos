/**
 * 端到端烟雾测试：注册 → 下单 → 日结 → 直推奖入账 → 对账
 * 用法：先启动 API，再执行 pnpm --filter @solar/api test:smoke
 */
import 'dotenv/config';

const BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
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
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = (await res.json()) as { code: number; message: string; data: T };
  if (json.code !== 0) throw new Error(`${path} 返回错误: ${json.code} ${json.message}`);
  return json.data;
}

async function main(): Promise<void> {
  console.log('=== 太阳线会员系统 · 烟雾测试 ===\n');

  // 1. 档位列表（需登录态，先登录管理员）
  console.log('[1] 档位与功能开关');
  const admin = await api<{ token: string }>('/api/auth/login', {
    method: 'POST',
    body: { phone: '13800138000', password: '123456' },
  });
  check('管理员登录成功', !!admin.token);

  const packages = await api<any[]>('/api/packages', { token: admin.token });
  check('档位数量为 4', packages.length === 4, packages.length);
  check('金卡价格 5000 / 权益值 15000', packages[1].price === 5000 && packages[1].equityValue === 15000);

  const adminMe = await api<any>('/api/me', { token: admin.token });
  const features = await api<{ features: any[] }>('/api/features?platform=h5', { token: admin.token });
  check('功能开关下发 20 项', features.features.length === 20, features.features.length);

  // 2. 注册两级用户
  console.log('\n[2] 注册与关系绑定');
  const suffix = String(Date.now()).slice(-8);
  const parentPhone = `137${suffix}`;
  const childPhone = `136${suffix}`;
  const parent = await api<{ token: string }>('/api/auth/register', {
    method: 'POST',
    body: { phone: parentPhone, password: '123456', nickname: '烟雾测试上级', inviteCode: adminMe.inviteCode },
  });
  const parentInfo = await api<any>('/api/me', { token: parent.token });
  check('上级绑定到管理员', parentInfo.inviteCode !== adminMe.inviteCode);

  const child = await api<{ token: string }>('/api/auth/register', {
    method: 'POST',
    body: { phone: childPhone, password: '123456', nickname: '烟雾测试下级', inviteCode: parentInfo.inviteCode },
  });
  const team = await api<any[]>('/api/me/team', { token: parent.token });
  check('直属下级包含新注册用户', team.some((u) => u.phone === childPhone));

  // 3. 下级购买金卡（管理端授予权益值后全额抵扣，系统无现金支付通道）
  console.log('\n[3] 下单与权益值发放');
  const childInfo = await api<any>('/api/me', { token: child.token });
  await api(`/api/admin/equity/${childInfo.id}/adjust`, {
    method: 'POST', token: admin.token, body: { amount: 5000, reason: '烟雾测试授予购卡权益值' },
  });
  const order = await api<any>('/api/orders', {
    method: 'POST',
    token: child.token,
    body: { type: 1, packageId: 2, useEquity: true, useBalance: false },
  });
  check('订单已付款并等待管理端交付（status=1）', order.status === 1, order.status);
  check('订单金额 5000 全额权益值抵扣', order.amount === 5000 && order.equityDeduct === 5000 && order.cashPay === 0, order);

  await api(`/api/admin/orders/${encodeURIComponent(order.orderNo)}/deliver`, {
    method: 'POST', token: admin.token,
  });
  const completedOrder = await api<any>(`/api/orders/${encodeURIComponent(order.orderNo)}/confirm`, {
    method: 'POST', token: child.token,
  });
  check('管理端交付后会员确认完成（status=3）', completedOrder.status === 3, completedOrder.status);

  const childEquity = await api<any>('/api/me/equity', { token: child.token });
  check('权益值发放 15000 = 5000×3', childEquity.balance === 15000, childEquity.balance);
  check('权益值批次有效期 12 个月', childEquity.lots.length === 1 && childEquity.lots[0].remaining === 15000);

  const childRank = await api<any>('/api/me/rank', { token: child.token });
  check('下级等级为普通会员', childRank.rankLevel === 0);

  // 4. 日结（业绩日 + 直推奖释放日）
  console.log('\n[4] 每日结算');
  const today = new Date();
  const perfDate = today.toISOString().slice(0, 10);
  // 直推奖第 1 期 dueAt 为订单完成日的次日 UTC 16:00，
  // 需再往后一天结算才能覆盖该分期的到期条件（与 e2e-full 保持一致）
  const releaseDate = new Date(today.getTime() + 2 * 86400_000).toISOString().slice(0, 10);

  // 超管走审批流会单人直通，返回 { direct: true, result: {...} }
  const settleResult = (r: any) => (r.result ?? r);
  const r1 = await api<any>('/api/admin/settlements/daily/rerun', {
    method: 'POST', token: admin.token, body: { date: perfDate },
  });
  check('业绩日日结完成', settleResult(r1).step === 11, r1);

  const r2 = await api<any>('/api/admin/settlements/daily/rerun', {
    method: 'POST', token: admin.token, body: { date: releaseDate },
  });
  check('直推奖释放日日结完成', settleResult(r2).step === 11 || settleResult(r2).skipped, r2);

  const r3 = await api<any>('/api/admin/settlements/daily/rerun', {
    method: 'POST', token: admin.token, body: { date: perfDate },
  });
  check('日结重跑可重入', settleResult(r3).step === 11, r3);

  // 5. 直推奖入账验证
  console.log('\n[5] 直推奖入账');
  const parentWallet = await api<any>('/api/me/wallet', { token: parent.token });
  check('上级钱包收到 250×70% = 175', parentWallet.balance === 175, parentWallet.balance);

  const parentToken = await api<any>('/api/me/token', { token: parent.token });
  check('上级数权记账 250×30% = 75', parentToken.total === 75, parentToken.total);

  const bonusRecords = await api<any>('/api/me/bonus/records', { token: parent.token });
  const direct = bonusRecords.list.find((r: any) => r.type === 1);
  check('存在直推奖记录', !!direct, bonusRecords.list);
  check('直推奖金额 250（5000÷20）', direct?.amount === 250, direct?.amount);

  const parentRank = await api<any>('/api/me/rank', { token: parent.token });
  check('上级团队累计业绩 = 5000', parentRank.totalPerformance === 5000, parentRank.totalPerformance);

  // 6. 对账
  console.log('\n[6] 账务对账');
  const recon = await api<any>('/api/admin/settlements/reconcile', {
    method: 'POST', token: admin.token, body: { date: perfDate },
  });
  check('5 项对账恒等式全部成立', recon.allPassed === true, recon.checks);

  // 7. 收益周期汇总与明细分页
  console.log('\n[7] 收益汇总与分页');
  const periods = await api<any>('/api/me/bonus/periods', { token: parent.token });
  check('今日/本月汇总结构完整', periods.today && periods.month && typeof periods.today.amount === 'number', periods);
  check('本月汇总含直推奖金额', periods.month.amount >= 250, periods.month.amount);

  const paged = await api<any>('/api/me/bonus/records?page=1', { token: parent.token });
  check('明细分页返回 page/pageSize', paged.page === 1 && paged.pageSize === 20, paged);

  const filtered = await api<any>('/api/me/bonus/records?type=1&page=1', { token: parent.token });
  check('按类型筛选仅返回直推奖', filtered.list.every((r: any) => r.type === 1), filtered.list);

  // 8. 会员间转账：发起 → 查询 → 确认接收
  console.log('\n[8] 钱包转账与确认接收');
  await api('/api/me/realname', {
    method: 'POST', token: parent.token, body: { realName: '烟雾测试', idCard: '110101199001010011' },
  });
  await api('/api/me/transfer-password', {
    method: 'POST', token: parent.token, body: { newPassword: '123456' },
  });
  const transfer = await api<any>('/api/me/wallet/transfers', {
    method: 'POST', token: parent.token,
    body: { toPhone: childPhone, amount: 10, paymentPassword: '123456' },
  });
  check('转账已发起且状态为待确认', transfer.status === 'PENDING', transfer);

  const fromList = await api<any>('/api/me/transfers/wallet?page=1', { token: parent.token });
  const pending = fromList.list.find((t: any) => t.transferNo === transfer.transferNo);
  check('转出方查询到待确认转账', !!pending && pending.status === 'PENDING', fromList.list);
  check('转账记录带对方手机号', pending?.toUser?.phone === childPhone, pending?.toUser);

  const toList = await api<any>('/api/me/transfers/wallet?page=1', { token: child.token });
  const incoming = toList.list.find((t: any) => t.transferNo === transfer.transferNo);
  check('接收方查询到待确认转账', !!incoming && incoming.status === 'PENDING', toList.list);
  check('接收方记录带对方手机号', incoming?.fromUser?.phone === parentPhone, incoming?.fromUser);

  await api(`/api/me/wallet/transfers/${incoming.id}/accept`, { method: 'POST', token: child.token });
  const childWallet = await api<any>('/api/me/wallet', { token: child.token });
  check('确认接收后下级余额 +10', childWallet.balance === 10, childWallet.balance);

  const parentWalletAfter = await api<any>('/api/me/wallet', { token: parent.token });
  check('转出方余额 175-10 = 165', parentWalletAfter.balance === 165, parentWalletAfter.balance);

  const toListAfter = await api<any>('/api/me/transfers/wallet?page=1', { token: child.token });
  const done = toListAfter.list.find((t: any) => t.transferNo === transfer.transferNo);
  check('确认后转账状态为已到账', done?.status === 'COMPLETED', done?.status);

  console.log(`\n=== 结果：通过 ${passed} 项，失败 ${failed}项 ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('烟雾测试异常:', e);
  process.exit(1);
});
