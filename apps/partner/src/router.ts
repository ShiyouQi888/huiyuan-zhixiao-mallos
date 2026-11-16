import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
  { path: '/login', component: () => import('./pages/Login.vue') },
  { path: '/auth', component: () => import('./pages/Auth.vue') },
  { path: '/', component: () => import('./pages/Overview.vue'), meta: { tab: true } },
  { path: '/team', component: () => import('./pages/Team.vue'), meta: { tab: true } },
  { path: '/income', component: () => import('./pages/Income.vue'), meta: { tab: true } },
  { path: '/level', component: () => import('./pages/Level.vue'), meta: { tab: true } },
  { path: '/dividend', component: () => import('./pages/Dividend.vue') },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// 准入守卫：无 token 去登录；有 token 先验证合伙人权限
router.beforeEach(async (to) => {
  const token = localStorage.getItem('solar_member_token');
  if (!token) {
    if (to.path === '/login' || to.path === '/auth') return true;
    return '/login';
  }
  if (to.path === '/login' || to.path === '/auth') return true;

  // 权限校验缓存在 sessionStorage，避免每次路由跳转都请求
  const checked = sessionStorage.getItem('solar_partner_checked');
  if (checked === 'true') return true;
  try {
    const res = await fetch(`${(import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api'}/access/partner/check`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.code !== 0) {
      sessionStorage.removeItem('solar_partner_checked');
      return '/login';
    }
    sessionStorage.setItem('solar_partner_checked', 'true');
    return true;
  } catch {
    return '/login';
  }
});
