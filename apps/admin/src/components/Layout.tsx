import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Archive, ChevronRight, CircleDollarSign, ClipboardCheck,
  FileBarChart, Files, FolderTree, Gift, LayoutDashboard, LogOut, Menu, Package, ScrollText,
  QrCode, Settings2, ShieldAlert, ShoppingBag, Trophy, UserCog, Users, Wallet, X, BarChart3,
} from 'lucide-react';
import { Button } from './ui';
import { ThemeToggle } from './ThemeToggle';
import { api, canAccessAdminPath, getAdminRole, resolveAssetUrl } from '../api';
import { DEFAULT_BRAND_SETTINGS, type BrandSettings } from '../../../../packages/shared/src/brand-settings';

const navGroups = [
  {
    label: '总览',
    items: [{ to: '/', label: '工作台', icon: LayoutDashboard }],
  },
  {
    label: '业务运营',
    items: [
      { to: '/catalog', label: '商品管理', icon: Package },
      { to: '/categories', label: '商品分类', icon: FolderTree },
      { to: '/files', label: '文件管理', icon: Files },
      { to: '/orders', label: '订单管理', icon: ShoppingBag },
      { to: '/members', label: '会员管理', icon: Users },
      { to: '/bonuses', label: '奖金管理', icon: CircleDollarSign },
      { to: '/ranks', label: '等级管理', icon: Trophy },
      { to: '/referral-poster', label: '邀请海报', icon: QrCode },
    ],
  },
  {
    label: '资金与结算',
    items: [
      { to: '/finance', label: '财务大盘', icon: BarChart3 },
      { to: '/assets', label: '资产管理', icon: Wallet },
      { to: '/settlements', label: '日结与对账', icon: Activity },
    ],
  },
  {
    label: '风控与治理',
    items: [
      { to: '/risk', label: '风控中心', icon: ShieldAlert },
      { to: '/approvals', label: '审批中心', icon: ClipboardCheck },
      { to: '/features', label: '功能开关', icon: Settings2 },
      { to: '/reports', label: '经营报表', icon: FileBarChart },
    ],
  },
  {
    label: '系统管理',
    items: [
      { to: '/operators', label: '运营账号', icon: UserCog },
      { to: '/system', label: '系统设置', icon: Archive },
      { to: '/audit', label: '审计日志', icon: ScrollText },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: '超级管理员',
  OPERATOR: '运营管理员',
  FINANCE: '财务管理员',
  SUPPORT: '客服专员',
};

export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [brand, setBrand] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const navigate = useNavigate();
  const location = useLocation();
  const role = getAdminRole();
  const visibleGroups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => canAccessAdminPath(item.to, role)) }))
    .filter((group) => group.items.length > 0);
  const currentGroup = visibleGroups.find((group) => group.items.some((item) => item.to === location.pathname));
  const currentPage = currentGroup?.items.find((item) => item.to === location.pathname);
  const roleLabel = role ? ROLE_LABELS[role] : '管理员';

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    const applyBrand = (settings: Partial<BrandSettings>) => {
      if (active) setBrand({ ...DEFAULT_BRAND_SETTINGS, ...settings });
    };
    api<BrandSettings>('/brand').then(applyBrand).catch(() => {});
    const onBrandUpdated = (event: Event) => {
      const settings = (event as CustomEvent<BrandSettings>).detail;
      if (settings) applyBrand(settings);
    };
    window.addEventListener('solar:brand-updated', onBrandUpdated);
    return () => {
      active = false;
      window.removeEventListener('solar:brand-updated', onBrandUpdated);
    };
  }, []);

  const logout = () => {
    localStorage.removeItem('solar_admin_token');
    localStorage.removeItem('solar_admin_access');
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-canvas">
      <aside
        className={`admin-sidebar fixed inset-y-0 left-0 z-30 flex flex-col border-r transition-[width,transform] duration-200
          ${collapsed ? 'w-[72px]' : 'w-[240px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className={`relative flex h-[60px] shrink-0 items-center border-b border-line ${collapsed ? 'justify-between px-1' : 'gap-2.5 px-4'}`}>
          <div className={`brand-mark flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ${brand.logoUrl ? 'bg-transparent shadow-none' : 'bg-accent shadow-xs'}`}>
            {brand.logoUrl
              ? <img src={resolveAssetUrl(brand.logoUrl)} alt="" aria-hidden="true" className="h-full w-full object-contain p-1" />
              : <Gift size={17} aria-hidden="true" />}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold leading-5 text-ink" title={brand.brandName}>{brand.brandName}</div>
                <div className="truncate text-2xs leading-4 text-ink-faint">运营管理平台</div>
              </div>
            </>
          )}
          <Button
            onClick={() => setCollapsed((value) => !value)}
            variant="ghost"
            size="sm"
            iconOnly
            className={collapsed ? 'hidden lg:flex' : 'ml-auto hidden lg:flex'}
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <Menu size={17} />
          </Button>
          <Button
            onClick={() => setMobileOpen(false)}
            variant="ghost"
            size="sm"
            iconOnly
            className="ml-auto lg:hidden"
            aria-label="关闭导航"
          >
            <X size={17} />
          </Button>
        </div>

        <nav className="admin-menu-scroll flex-1 overflow-y-auto px-2.5 py-3">
          {visibleGroups.map((group) => (
            <div key={group.label} className="mb-4 last:mb-1">
              {!collapsed && <div className="admin-nav-group-label">{group.label}</div>}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      title={collapsed ? item.label : undefined}
                      className={collapsed ? 'admin-nav-link justify-center px-0' : 'admin-nav-link'}
                    >
                      <Icon size={16} strokeWidth={1.9} className="shrink-0 text-ink-muted" aria-hidden="true" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line p-2.5">
          <button
            type="button"
            onClick={logout}
            title={collapsed ? '退出登录' : undefined}
            className={`admin-nav-link w-full hover:!text-danger ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <LogOut size={16} strokeWidth={1.9} className="shrink-0" aria-hidden="true" />
            {!collapsed && <span>退出登录</span>}
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="关闭导航"
          className="fixed inset-0 z-20 bg-[var(--overlay)] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className={`min-h-screen transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[240px]'}`}>
        <header className="admin-header sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-md sm:px-6">
          <Button
            onClick={() => setMobileOpen(true)}
            variant="ghost"
            size="sm"
            iconOnly
            className="lg:hidden"
            aria-label="打开导航"
          >
            <Menu size={18} />
          </Button>

          <nav className="breadcrumb min-w-0 flex-1" aria-label="面包屑">
            <span className="hidden sm:inline">管理后台</span>
            {currentGroup && <ChevronRight size={12} className="hidden shrink-0 text-ink-faint sm:inline" aria-hidden="true" />}
            {currentGroup && <span className="hidden shrink-0 sm:inline">{currentGroup.label}</span>}
            <ChevronRight size={12} className="shrink-0 text-ink-faint" aria-hidden="true" />
            <span className="breadcrumb-current truncate">{currentPage?.label ?? '管理后台'}</span>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <div className="mx-1.5 hidden h-5 w-px bg-line sm:block" />
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-xs font-semibold text-accent-ink" aria-hidden="true">
                管
              </div>
              <div className="leading-tight">
                <div className="text-xs font-medium text-ink">平台管理员</div>
                <div className="text-2xs text-ink-faint">{roleLabel}</div>
              </div>
            </div>
          </div>
        </header>

        <main key={location.pathname} className="admin-main page-enter mx-auto w-full max-w-page">{children}</main>
      </div>
    </div>
  );
}
