import { defineStore } from 'pinia';
import { DEFAULT_BRAND_SETTINGS, type BrandSettings } from '../../../../packages/shared/src/brand-settings';
import { api } from '../api';

export const useBrandStore = defineStore('partner-brand', {
  state: () => ({ settings: { ...DEFAULT_BRAND_SETTINGS } as BrandSettings, loaded: false }),
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return;
      try {
        this.settings = { ...DEFAULT_BRAND_SETTINGS, ...await api<BrandSettings>('/brand') };
      } finally {
        this.loaded = true;
      }
    },
  },
});
