<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useFeaturesStore } from './stores/features';
import { LayoutDashboard, Network, TrendingUp, Award } from 'lucide-vue-next';

const route = useRoute();
const features = useFeaturesStore();
const showTab = computed(() => !!route.meta.tab);
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
