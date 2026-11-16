import { defineStore } from 'pinia';
import { api } from '../api';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('solar_member_token') ?? '',
    profile: null as any,
    features: [] as string[],
    access: null as any,
  }),
  getters: {
    loggedIn: (s) => !!s.token,
    has: (s) => (code: string) => s.features.length === 0 || s.features.includes(code),
  },
  actions: {
    setToken(token: string) {
      this.token = token;
      localStorage.setItem('solar_member_token', token);
    },
    logout() {
      this.token = '';
      this.profile = null;
      this.features = [];
      localStorage.removeItem('solar_member_token');
    },
    async loadProfile() {
      if (!this.token) return;
      const [me, f, access] = await Promise.all([
        api<any>('/me'),
        api<{ features: Array<{ code: string }> }>('/features?platform=h5'),
        api<any>('/access/roles').catch(() => null),
      ]);
      this.profile = me;
      this.features = f.features.map((x) => x.code);
      this.access = access;
    },
  },
});
