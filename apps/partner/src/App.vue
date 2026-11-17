<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useFeaturesStore } from './stores/features';
import { useBrandStore } from './stores/brand';
import BrandFooter from './components/BrandFooter.vue';
import { LayoutDashboard, Network, TrendingUp, Award } from 'lucide-vue-next';

const route = useRoute();
const features = useFeaturesStore();
const brand = useBrandStore();
const showTab = computed(() => !!route.meta.tab);
const showLegalFooter = computed(() => !['/login', '/auth'].includes(route.path));
onMounted(() => { brand.load().catch(() => {}); });
watch(() => brand.settings.brandName, (name) => { document.title = `${name} · 合伙人中心`; }, { immediate: true });
const tabs = [
  { path: '/', label: '总览', icon: LayoutDashboard },
  { path: '/team', label: '团队', icon: Network, flag: 'team.view' },
  { path: '/income', label: '收益', icon: TrendingUp, flag: 'bonus.detail' },
  { path: '/level', label: '等级', icon: Award, flag: 'rank.view' },
];
const visibleTabs = computed(() => tabs.filter((tab) => !('flag' in tab) || features.has(tab.flag)));
</script>

<template>
  <div class="phone-shell">
    <router-view />
    <BrandFooter v-if="showLegalFooter" />
    <nav v-if="showTab" class="tabbar">
      <router-link
        v-for="t in visibleTabs"
        :key="t.path"
        :to="t.path"
        class="tab-item"
        :class="{ active: route.path === t.path }"
      >
        <span class="tab-icon">
          <component :is="t.icon" :size="21" :stroke-width="1.9" aria-hidden="true" />
        </span>
        <span>{{ t.label }}</span>
      </router-link>
    </nav>
  </div>
</template>
