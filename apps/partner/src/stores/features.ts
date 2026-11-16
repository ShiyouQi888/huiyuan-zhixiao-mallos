import { defineStore } from 'pinia';
import { api } from '../api';

export const useFeaturesStore = defineStore('partner-features', {
  state: () => ({
    codes: [] as string[],
    loaded: false,
    loading: false,
  }),
  getters: {
    has: (state) => (code: string) => !state.loaded || state.codes.includes(code),
  },
  actions: {
    reset() {
      this.codes = [];
      this.loaded = false;
      this.loading = false;
    },
    async load() {
      if (this.loaded || this.loading) return;
      this.loading = true;
      try {
        const result = await api<{ features: Array<{ code: string }> }>('/features?platform=h5');
        this.codes = result.features.map((feature) => feature.code);
      } catch {
        this.codes = [];
      } finally {
        this.loaded = true;
        this.loading = false;
      }
    },
  },
});
