import { defineStore } from 'pinia';
import { api } from '../api';

let featuresRequest: Promise<void> | null = null;

export const useUserStore = defineStore('user', {
  state: () => ({
    token: localStorage.getItem('solar_member_token') ?? '',
    profile: null as any,
    features: [] as string[],
    featuresLoaded: false,
    access: null as any,
  }),
  getters: {
    loggedIn: (s) => !!s.token,
    has: (s) => (code: string) => !s.featuresLoaded || s.features.includes(code),
  },
  actions: {
    setToken(token: string) {
      this.token = token;
      this.featuresLoaded = false;
      this.features = [];
      localStorage.setItem('solar_member_token', token);
    },
    logout() {
      this.token = '';
      this.profile = null;
      this.features = [];
      this.featuresLoaded = false;
      this.access = null;
      localStorage.removeItem('solar_member_token');
    },
    async loadFeatures(force = false) {
      if (this.featuresLoaded && !force) return;
      if (featuresRequest) {
        await featuresRequest;
        return;
      }

      const requestedToken = this.token;
      featuresRequest = (async () => {
        try {
          const result = await api<{ features: Array<{ code: string }> }>('/features?platform=h5');
          if (requestedToken === this.token) this.features = result.features.map((feature) => feature.code);
        } catch {
          if (requestedToken === this.token) this.features = [];
        } finally {
          if (requestedToken === this.token) this.featuresLoaded = true;
          featuresRequest = null;
        }
      })();
      await featuresRequest;
    },
    async loadProfile() {
      if (!this.token) return;
      const [profile, access] = await Promise.all([
        api<any>('/me').catch(() => null),
        api<any>('/access/roles').catch(() => null),
        this.loadFeatures(),
      ]);
      this.profile = profile;
      this.access = access;
    },
  },
});
