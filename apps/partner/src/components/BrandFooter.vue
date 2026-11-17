<script setup lang="ts">
import { computed } from 'vue';
import { ShieldCheck } from 'lucide-vue-next';
import { useBrandStore } from '../stores/brand';

const brand = useBrandStore();
const publicSecurityUrl = computed(() => brand.settings.publicSecurityFilingUrl || 'https://www.beian.gov.cn/');
</script>

<template>
  <footer class="brand-legal-footer">
    <p>{{ brand.settings.footerText }}</p>
    <div v-if="brand.settings.icpFilingNumber || brand.settings.publicSecurityFilingNumber" class="brand-legal-links">
      <a v-if="brand.settings.icpFilingNumber" :href="brand.settings.icpFilingUrl || 'https://beian.miit.gov.cn/'" target="_blank" rel="noreferrer">
        <ShieldCheck :size="12" aria-hidden="true" />{{ brand.settings.icpFilingNumber }}
      </a>
      <a v-if="brand.settings.publicSecurityFilingNumber" :href="publicSecurityUrl" target="_blank" rel="noreferrer">
        <ShieldCheck :size="12" aria-hidden="true" />{{ brand.settings.publicSecurityFilingNumber }}
      </a>
    </div>
  </footer>
</template>

<style scoped>
.brand-legal-footer { display: grid; justify-items: center; gap: 7px; padding: 14px 18px calc(18px + env(safe-area-inset-bottom)); border-top: 1px solid var(--line); background: var(--bg); color: var(--muted); text-align: center; }
.brand-legal-footer p { margin: 0; font-size: 10px; line-height: 1.55; }
.brand-legal-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px 13px; }
.brand-legal-links a { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 9px; line-height: 1.5; text-decoration: none; }
.brand-legal-links a:hover { color: var(--brand); }
</style>
