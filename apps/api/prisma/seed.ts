/**
 * 初始化种子数据
 * 数据来源：docs/太阳线会员系统-完整架构文档.md 第 11.1 节
 * 幂等：全部使用 upsert，可重复执行。
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const RANKS = [
  { id: 0, level: 0, name: '普通会员', threshold: 0, teamRate: 0, poolRate: 0, sort: 0 },
  { id: 1, level: 1, name: '业务主任', threshold: 50000, teamRate: 0.03, poolRate: 0, sort: 1 },
  { id: 2, level: 2, name: '业务经理', threshold: 300000, teamRate: 0.06, poolRate: 0, sort: 2 },
  { id: 3, level: 3, name: '业务总监', threshold: 1000000, teamRate: 0.09, poolRate: 0, sort: 3 },
  { id: 4, level: 4, name: '业务副总', threshold: 3000000, teamRate: 0.12, poolRate: 0.02, sort: 4 },
  { id: 5, level: 5, name: '业务总经理', threshold: 6000000, teamRate: 0.15, poolRate: 0.02, sort: 5 },
  { id: 6, level: 6, name: '业务总裁', threshold: 10000000, teamRate: 0.18, poolRate: 0.01, sort: 6 },
];

const PACKAGES = [
  { id: 1, level: 1, name: '银卡', price: 2000n, equityValue: 6000n, durationDays: 365, sort: 1, items: [{ name: '银卡礼包', quantity: 1 }] },
  { id: 2, level: 2, name: '金卡', price: 5000n, equityValue: 15000n, durationDays: 365, sort: 2, items: [{ name: '金卡礼包', quantity: 1 }] },
  { id: 3, level: 3, name: '钻卡', price: 10000n, equityValue: 30000n, durationDays: 365, sort: 3, items: [{ name: '钻卡礼包', quantity: 1 }] },
  { id: 4, level: 4, name: '至尊卡', price: 20000n, equityValue: 60000n, durationDays: 365, sort: 4, items: [{ name: '至尊卡礼包', quantity: 1 }] },
];

const CONFIGS: Array<{ key: string; value: unknown; group: string; description: string }> = [
  { key: 'bonus.reward_rate', value: 1.0, group: 'bonus', description: '直推奖比例（新购/升级）' },
  { key: 'bonus.repurchase_rate', value: 0.1, group: 'bonus', description: '复消直推奖比例' },
  { key: 'bonus.peer_rate', value: 1.0, group: 'bonus', description: '平级奖比例' },
  { key: 'bonus.leader_rate', value: 0.5, group: 'bonus', description: '领导奖比例' },
  { key: 'bonus.cash_ratio', value: 0.7, group: 'bonus', description: '奖金拆分到钱包比例' },
  { key: 'bonus.token_ratio', value: 0.3, group: 'bonus', description: '奖金拆分到数权比例' },
  { key: 'bonus.direct_periods', value: 20, group: 'bonus', description: '直推奖释放期数' },
  { key: 'bonus.team_exclude_enabled', value: true, group: 'bonus', description: '团队奖是否剔除业绩最大的一条直推线（含其领导奖/平级奖）' },
  { key: 'bonus.team_exclude_ratio', value: 0, group: 'bonus', description: '剔除最大线的占比阈值，0=无条件剔除（仅需直接下线≥2条）' },
  { key: 'equity.expire_months', value: 12, group: 'equity', description: '权益值有效期（月）' },
  { key: 'transfer.enabled', value: true, group: 'transfer', description: '转账总开关' },
  { key: 'transfer.limit', value: 0, group: 'transfer', description: '单笔转账限额，0=不限' },
  { key: 'transfer.accept_timeout_hours', value: 24, group: 'transfer', description: '转账确认超时（小时）' },
  { key: 'token.transfer_enabled', value: true, group: 'token', description: '数权转账开关（即时到账）' },
  { key: 'token.transfer_limit', value: 0, group: 'token', description: '数权单笔转账限额，0=不限' },
  { key: 'order.auto_finish_days', value: 10, group: 'order', description: '自动确认收货天数' },
  { key: 'order.pay_timeout_minutes', value: 30, group: 'order', description: '支付超时（分钟）' },
  { key: 'access.partner_min_level', value: 1, group: 'access', description: '合伙人端准入最低等级（含）' },
];

const FEATURE_FLAGS = [
  ['package.purchase', '礼包购买', 'package'],
  ['product.mall', '商品商城', 'product'],
  ['member.upgrade', '档位升级', 'member'],
  ['member.repurchase', '复消入口', 'member'],
  ['referral.center', '推广中心', 'referral'],
  ['team.view', '团队查看', 'team'],
  ['bonus.detail', '收益明细', 'bonus'],
  ['equity.account', '权益值账户', 'equity'],
  ['equity.transfer', '权益值转账', 'equity'],
  ['wallet.account', '钱包余额', 'wallet'],
  ['wallet.transfer', '余额转账', 'wallet'],
  ['token.view', '数权查看', 'token'],
  ['token.transfer', '数权转账', 'token'],
  ['rank.view', '等级信息', 'rank'],
  ['rank.dividend', '分红池明细', 'rank'],
  ['notify.subscribe', '消息订阅', 'notify'],
  ['realname', '实名认证', 'user'],
  ['customer.service', '客服入口', 'user'],
  ['address.manage', '收货地址管理', 'user'],
  ['transfer.password', '转账支付密码', 'wallet'],
] as const;

async function main() {
  console.log('开始写入种子数据...');

  // 等级（7）
  for (const r of RANKS) {
    await prisma.rank.upsert({
      where: { id: r.id },
      create: { ...r, teamRate: r.teamRate as never, poolRate: r.poolRate as never },
      update: { name: r.name, threshold: r.threshold, teamRate: r.teamRate as never, poolRate: r.poolRate as never, sort: r.sort },
    });
  }
  console.log(`  ranks: ${RANKS.length}`);

  // 档位（4）
  for (const p of PACKAGES) {
    await prisma.package.upsert({
      where: { id: p.id },
      create: { ...p, items: p.items as never, status: 1 },
      update: { name: p.name, price: p.price, equityValue: p.equityValue, durationDays: p.durationDays, items: p.items as never, sort: p.sort },
    });
  }
  console.log(`  packages: ${PACKAGES.length}`);

  // 配置（18）
  for (const c of CONFIGS) {
    await prisma.config.upsert({
      where: { key: c.key },
      create: { key: c.key, value: c.value as never, group: c.group, description: c.description },
      update: { value: c.value as never, group: c.group, description: c.description },
    });
  }
  console.log(`  configs: ${CONFIGS.length}`);

  // 功能开关（20）
  for (const [code, name, module] of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { code },
      create: { code, name, module, enabled: true, platforms: [] as never, minRankLevel: 0, config: {} as never },
      update: { name, module },
    });
  }
  console.log(`  feature_flags: ${FEATURE_FLAGS.length}`);

  // 商品分类（两级）
  const categories = [
    { id: 1n, name: '家居生活', parentId: null, icon: 'House', sort: 1 },
    { id: 2n, name: '数码电器', parentId: null, icon: 'Laptop', sort: 2 },
    { id: 3n, name: '健康养护', parentId: null, icon: 'Leaf', sort: 3 },
    { id: 4n, name: '厨房用品', parentId: 1n, icon: 'Utensils', sort: 1 },
    { id: 5n, name: '手机配件', parentId: 2n, icon: 'Smartphone', sort: 1 },
  ];
  for (const c of categories) {
    await prisma.productCategory.upsert({
      where: { id: c.id },
      create: { ...c, status: 1 },
      update: { name: c.name, icon: c.icon ?? undefined, sort: c.sort },
    });
  }
  console.log(`  product_categories: ${categories.length}`);

  // 示例商品
  const products = [
    { id: 1n, name: '智能扫地机器人', subtitle: '全自动规划清扫', categoryId: 2n, price: 1999n, originalPrice: 2599n, stock: 100, status: 1, isFeatured: true, sort: 1 },
    { id: 2n, name: '多功能破壁机', subtitle: '破壁养生一步到位', categoryId: 4n, price: 899n, originalPrice: 1299n, stock: 200, status: 1, isNew: true, sort: 2 },
    { id: 3n, name: '无线蓝牙耳机', subtitle: '主动降噪长续航', categoryId: 5n, price: 399n, originalPrice: 599n, stock: 500, status: 1, sort: 3 },
    { id: 4n, name: '天然草本精华套装', subtitle: '日常养护礼盒', categoryId: 3n, price: 699n, originalPrice: 999n, stock: 80, status: 1, isFeatured: true, sort: 4 },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { id: p.id },
      create: p,
      update: { ...p },
    });
    // 默认绑定全部四档
    for (const level of [1, 2, 3, 4]) {
      await prisma.productPackage.upsert({
        where: { productId_packageId: { productId: p.id, packageId: level } },
        create: { productId: p.id, packageId: level },
        update: {},
      });
    }
  }
  console.log(`  products: ${products.length}（均绑定四档）`);

  // 超级管理员 + 演示用户
  const passwordHash = bcrypt.hashSync('123456', 10);
  const demoUsers = [
    { phone: '13800138000', nickname: '平台管理员', inviteCode: 'ADMIN0001', role: 'SUPER_ADMIN', parentId: null, realNameStatus: 1 },
    { phone: '13900000001', nickname: '演示用户A', inviteCode: 'DEMO00001', role: 'MEMBER', parentId: null, realNameStatus: 1 },
    { phone: '13900000002', nickname: '演示用户B', inviteCode: 'DEMO00002', role: 'MEMBER', parentId: '13900000001', realNameStatus: 1 },
    { phone: '13900000003', nickname: '演示用户C', inviteCode: 'DEMO00003', role: 'MEMBER', parentId: '13900000002', realNameStatus: 0 },
  ];

  for (const [i, u] of demoUsers.entries()) {
    const parent = u.parentId ? await prisma.user.findUnique({ where: { phone: u.parentId } }) : null;
    const path = parent ? `${parent.path}${parent.id},` : ',';
    const depth = parent ? parent.depth + 1 : 0;

    const user = await prisma.user.upsert({
      where: { phone: u.phone },
      create: {
        phone: u.phone,
        nickname: u.nickname,
        inviteCode: u.inviteCode,
        passwordHash,
        role: u.role,
        realNameStatus: u.realNameStatus,
        realName: u.realNameStatus ? u.nickname : null,
        parentId: parent?.id ?? null,
        path,
        depth,
        rankId: 0,
        rankLevel: 0,
      },
      update: { nickname: u.nickname, passwordHash, role: u.role },
    });

    await prisma.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    await prisma.equityAccount.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    if (i === 0) console.log(`  管理员: ${u.phone} / 123456`);
  }
  console.log(`  users: ${demoUsers.length}`);

  // 手动指定 id 后必须推进自增序列，否则新建记录会主键冲突
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"ProductCategory"', 'id'), COALESCE((SELECT MAX(id) FROM "ProductCategory"), 1))`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Product"', 'id'), COALESCE((SELECT MAX(id) FROM "Product"), 1))`,
  );

  console.log('种子数据写入完成。');
}

main()
  .catch((e) => {
    console.error('种子数据写入失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
