import { createRouter, createWebHashHistory } from 'vue-router';
import { useUserStore } from './stores/user';

/**
 * 会员端信息架构（重新设计）
 * 只保留四块：商城 / 分享 / 收益 / 我的
 * 等级、团队、分红池、平级/领导奖等归入独立的合伙人端。
 */
const routes = [
  { path: '/login', component: () => import('./pages/Login.vue'), meta: { immersive: true } },

  // 四个底部 Tab
  { path: '/', component: () => import('./pages/Mall.vue'), meta: { tab: true, flag: 'product.mall' } },
  { path: '/share', component: () => import('./pages/Share.vue'), meta: { tab: true, flag: 'referral.center' } },
  { path: '/income', component: () => import('./pages/Income.vue'), meta: { tab: true, flag: 'bonus.detail' } },
  { path: '/mine', component: () => import('./pages/Mine.vue'), meta: { tab: true } },

  // 子页面
  { path: '/products', component: () => import('./pages/Products.vue') },
  { path: '/product/:id', component: () => import('./pages/ProductDetail.vue'), meta: { immersive: true } },
  { path: '/orders', component: () => import('./pages/Orders.vue') },
  { path: '/assets', component: () => import('./pages/Assets.vue') },
  { path: '/packages', component: () => import('./pages/Packages.vue') },

  // 兼容旧链接：跳转到新结构
  { path: '/bonus', redirect: '/income' },
  { path: '/referral', redirect: '/share' },
  { path: '/rank', redirect: '/mine' },
  { path: '/team', redirect: '/mine' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

router.beforeEach((to) => {
  const token = localStorage.getItem('solar_member_token');
  if (!token && to.path !== '/login') return '/login';
  if (token && to.path === '/login') return '/';

  // 功能开关：被关闭的 Tab/页面直接拦截，防止手动输入 hash 绕过
  const flag = to.meta.flag as string | undefined;
  if (flag) {
    const store = useUserStore();
    if (!store.has(flag)) return '/';
  }
});
