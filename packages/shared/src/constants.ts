/**
 * 太阳线会员系统 · 全局业务常量
 * 口径来源：docs/太阳线会员系统-完整架构文档.md
 * 前后端共用，禁止在业务代码中硬编码这些数值。
 */

/* ---------------- 错误码 ---------------- */
export const ErrorCode = {
  OK: 0,
  // 1001-1099 参数校验
  INVALID_PARAM: 1001,
  INVALID_PHONE: 1002,
  INVALID_AMOUNT: 1003,
  // 2001-2099 鉴权 / 权限
  UNAUTHORIZED: 2001,
  FORBIDDEN: 2002,
  TOKEN_EXPIRED: 2003,
  NEED_REALNAME: 2004,
  FEATURE_DISABLED: 2005,
  // 3001-3099 业务拒绝
  INSUFFICIENT_BALANCE: 3001,
  ORDER_STATUS_CONFLICT: 3002,
  TRANSFER_SELF: 3003,
  TRANSFER_EXPIRED: 3004,
  ALREADY_ACCEPTED: 3005,
  RISK_REJECTED: 3006,
  // 4001-4099 资源不存在
  USER_NOT_FOUND: 4001,
  PACKAGE_NOT_FOUND: 4002,
  ORDER_NOT_FOUND: 4003,
  TRANSFER_NOT_FOUND: 4004,
  // 5000 系统错误
  INTERNAL_ERROR: 5000,
} as const;

/* ---------------- 枚举 ---------------- */
export const OrderStatus = {
  CREATED: 0,      // 待支付
  PAID: 1,         // 已付款
  DELIVERED: 2,    // 已交付
  COMPLETED: 3,    // 已完成（终态，记录业绩）
} as const;

export const OrderType = {
  NEW: 1,          // 新购礼包
  UPGRADE: 2,      // 档位升级
  REPURCHASE: 3,   // 复消
  PRODUCT: 4,      // 普通商品
} as const;

export const BonusType = {
  DIRECT: 1,       // 直推奖
  TEAM: 2,         // 团队奖
  PEER: 3,         // 平级奖
  LEADER: 4,       // 领导奖
  DIVIDEND: 5,     // 分红池
} as const;

/* ---------------- 档位初始化数据 ---------------- */
export interface PackageSeed {
  level: number;
  name: string;
  price: number;
  transferQuota: number;
  durationDays: number;
}

export const PACKAGE_SEEDS: PackageSeed[] = [
  { level: 1, name: '银卡', price: 2000, transferQuota: 6000, durationDays: 365 },
  { level: 2, name: '金卡', price: 5000, transferQuota: 15000, durationDays: 365 },
  { level: 3, name: '钻卡', price: 10000, transferQuota: 30000, durationDays: 365 },
  { level: 4, name: '至尊卡', price: 20000, transferQuota: 60000, durationDays: 365 },
];

/* ---------------- 等级初始化数据 ---------------- */
export interface RankSeed {
  level: number;
  name: string;
  threshold: number;
  teamRate: number;
  poolRate: number;
}

export const RANK_SEEDS: RankSeed[] = [
  { level: 0, name: '普通会员', threshold: 0, teamRate: 0, poolRate: 0 },
  { level: 1, name: '业务主任', threshold: 50000, teamRate: 0.03, poolRate: 0 },
  { level: 2, name: '业务经理', threshold: 300000, teamRate: 0.06, poolRate: 0 },
  { level: 3, name: '业务总监', threshold: 1000000, teamRate: 0.09, poolRate: 0 },
  { level: 4, name: '业务副总', threshold: 3000000, teamRate: 0.12, poolRate: 0.02 },
  { level: 5, name: '业务总经理', threshold: 6000000, teamRate: 0.15, poolRate: 0.02 },
  { level: 6, name: '业务总裁', threshold: 10000000, teamRate: 0.18, poolRate: 0.01 },
];

/* ---------------- 配置初始化数据 ---------------- */
export const CONFIG_SEEDS: Record<string, { value: unknown; group: string; description: string }> = {
  'bonus.reward_rate':        { value: 1.0,  group: 'bonus',    description: '直推奖比例（新购/升级）' },
  'bonus.repurchase_rate':    { value: 0.1,  group: 'bonus',    description: '复消直推奖比例' },
  'bonus.peer_rate':          { value: 1.0,  group: 'bonus',    description: '平级奖比例' },
  'bonus.leader_rate':        { value: 0.5,  group: 'bonus',    description: '领导奖比例' },
  'bonus.cash_ratio':         { value: 0.7,  group: 'bonus',    description: '奖金拆分到钱包比例' },
  'bonus.token_ratio':        { value: 0.3,  group: 'bonus',    description: '奖金拆分到太阳值比例' },
  'bonus.direct_periods':     { value: 20,   group: 'bonus',    description: '直推奖释放期数' },
  'transfer.enabled':         { value: true, group: 'transfer', description: '转账总开关' },
  'transfer.limit':           { value: 0,    group: 'transfer', description: '单笔转账限额，0=不限' },
  'transfer.accept_timeout_hours': { value: 24, group: 'transfer', description: '转账确认超时（小时）' },
  'order.auto_finish_days':   { value: 10,   group: 'order',    description: '自动确认收货天数' },
  'order.pay_timeout_minutes':{ value: 30,   group: 'order',    description: '支付超时（分钟）' },
  'access.partner_min_level': { value: 1,    group: 'access',   description: '合伙人端准入最低等级（含）' },
};

/* ---------------- 功能开关初始化数据 ---------------- */
export const FEATURE_FLAG_SEEDS = [
  { code: 'package.purchase',   name: '礼包购买',     module: 'package' },
  { code: 'product.mall',       name: '商品商城',     module: 'product' },
  { code: 'member.upgrade',     name: '档位升级',     module: 'member' },
  { code: 'member.repurchase',  name: '复消入口',     module: 'member' },
  { code: 'referral.center',    name: '推广中心',     module: 'referral' },
  { code: 'team.view',          name: '团队查看',     module: 'team' },
  { code: 'bonus.detail',       name: '收益明细',     module: 'bonus' },
  { code: 'wallet.transfer_quota', name: '权益通', module: 'wallet' },
  { code: 'wallet.account',     name: '钱包余额',     module: 'wallet' },
  { code: 'wallet.transfer',    name: '余额转账',     module: 'wallet' },
  { code: 'token.view',         name: '太阳值查看',   module: 'token' },
  { code: 'rank.dividend',      name: '分红池明细',   module: 'rank' },
  { code: 'notify.subscribe',   name: '消息订阅',     module: 'notify' },
  { code: 'realname',           name: '实名认证',     module: 'user' },
  { code: 'customer.service',   name: '客服入口',     module: 'user' },
] as const;

/* ---------------- 业务参数 ---------------- */
export const DIRECT_PERIODS = 20;          // 直推奖分 20 期
export const CASH_RATIO = 0.7;              // 奖金 70% 进钱包
export const TOKEN_RATIO = 0.3;             // 奖金 30% 进太阳值
export const TRANSFER_TIMEOUT_HOURS = 24;   // 转账确认超时
export const DAILY_SETTLE_HOUR = 2;         // 日结时间
export const RECONCILE_HOUR = 4;            // 对账时间
