export type AdminRole = 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE' | 'SUPPORT';

export interface AdminPermissionModule {
  code: string;
  name: string;
  path: string;
  description: string;
}

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: '超级管理员',
  OPERATOR: '运营管理员',
  FINANCE: '财务管理员',
  SUPPORT: '客服专员',
};

export const ADMIN_PERMISSION_MODULES: AdminPermissionModule[] = [
  { code: 'dashboard', name: '工作台', path: '/', description: '经营总览与待办事项' },
  { code: 'catalog', name: '商品管理', path: '/catalog', description: '商品信息、价格与上下架' },
  { code: 'categories', name: '商品分类', path: '/categories', description: '商品类目与分类维护' },
  { code: 'files', name: '文件管理', path: '/files', description: '图片与文件素材管理' },
  { code: 'orders', name: '订单管理', path: '/orders', description: '订单查看、交付与收货' },
  { code: 'members', name: '会员管理', path: '/members', description: '会员资料、状态与关系' },
  { code: 'bonuses', name: '奖金管理', path: '/bonuses', description: '奖金记录与调整流程' },
  { code: 'ranks', name: '等级管理', path: '/ranks', description: '会员礼包与等级规则' },
  { code: 'referral.poster', name: '邀请海报', path: '/referral-poster', description: 'H5 邀请海报模板与二维码排版' },
  { code: 'assets', name: '资产管理', path: '/assets', description: '钱包、权益通、资产流水与会员转账审核' },
  { code: 'finance', name: '财务大盘', path: '/finance', description: '钱包、权益通、太阳值、订单与会员资金总览' },
  { code: 'settlements', name: '日结与对账', path: '/settlements', description: '日结、重跑与资金对账' },
  { code: 'risk', name: '风控中心', path: '/risk', description: '风险事件与设备管理' },
  { code: 'approvals', name: '审批中心', path: '/approvals', description: '敏感业务申请与复核' },
  { code: 'features', name: '功能开关', path: '/features', description: '会员端功能启停与配置' },
  { code: 'reports', name: '数据报表', path: '/reports', description: '业绩、奖金与经营报表' },
  { code: 'system', name: '系统设置', path: '/system', description: '全局业务参数与角色说明' },
  { code: 'audit', name: '审计日志', path: '/audit', description: '后台敏感操作记录' },
  { code: 'operator.accounts', name: '运营账号', path: '/operators', description: '后台账号、角色与权限分配' },
];

export const ADMIN_ROLE_PERMISSION_CODES: Record<AdminRole, string[]> = {
  SUPER_ADMIN: ADMIN_PERMISSION_MODULES.map((module) => module.code),
  OPERATOR: ['dashboard', 'catalog', 'categories', 'files', 'orders', 'members', 'bonuses', 'assets', 'finance', 'settlements', 'risk', 'approvals', 'reports'],
  FINANCE: ['dashboard', 'orders', 'members', 'bonuses', 'assets', 'finance', 'settlements', 'approvals', 'reports'],
  SUPPORT: ['orders', 'members', 'reports'],
};

export const ADMIN_PATH_PERMISSION: Record<string, string> = Object.fromEntries(
  ADMIN_PERMISSION_MODULES.map((module) => [module.path, module.code]),
);

export function isAdminRole(value: string): value is AdminRole {
  return value === 'SUPER_ADMIN' || value === 'OPERATOR' || value === 'FINANCE' || value === 'SUPPORT';
}

/** Map backend admin endpoints to the page permission required to use them. */
export function resolveAdminApiPermission(requestPath: string): string | undefined {
  const path = requestPath.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  if (path === '/api/admin/operators/access') return undefined;

  const rules: Array<[string, string]> = [
    ['/api/admin/operators', 'operator.accounts'],
    ['/api/admin/catalog/categories', 'categories'],
    ['/api/admin/catalog', 'catalog'],
    ['/api/admin/files', 'files'],
    ['/api/admin/dashboard', 'dashboard'],
    ['/api/admin/finance', 'finance'],
    ['/api/admin/members', 'members'],
    ['/api/admin/orders', 'orders'],
    ['/api/admin/bonus', 'bonuses'],
    ['/api/admin/dividend', 'bonuses'],
    ['/api/admin/settlements', 'settlements'],
    ['/api/admin/transfers', 'assets'],
    ['/api/admin/wallets', 'assets'],
    ['/api/admin/equity', 'assets'],
    ['/api/admin/transfer-quotas', 'assets'],
    ['/api/admin/tokens', 'assets'],
    ['/api/admin/packages', 'catalog'],
    ['/api/admin/referral/poster', 'referral.poster'],
    ['/api/admin/products', 'catalog'],
    ['/api/admin/ranks', 'ranks'],
    ['/api/admin/risk', 'risk'],
    ['/api/admin/approvals', 'approvals'],
    ['/api/admin/features', 'features'],
    ['/api/admin/reports', 'reports'],
    ['/api/admin/configs', 'system'],
    ['/api/admin/roles', 'system'],
    ['/api/admin/audit-logs', 'audit'],
    ['/api/admin/tasks', 'settlements'],
  ];

  return rules.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
}
