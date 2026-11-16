<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Crown, LayoutDashboard, Network, TrendingUp, Award } from 'lucide-vue-next';

const route = useRoute();
const showTab = computed(() => !!route.meta.tab);
const tabs = [
  { path: '/', label: '总览', icon: LayoutDashboard },
  { path: '/team', label: '团队', icon: Network },
  { path: '/income', label: '收益', icon: TrendingUp },
  { path: '/level', label: '等级', icon: Award },
];
</script>

<template>
  <div class="phone-shell">
    <router-view />
    <nav v-if="showTab" class="tabbar">
      <router-link v-for="t in tabs" :key="t.path" :to="t.path" class="tab-item"
        :class="{ active: route.path === t.path }">
        <component :is="t.icon" :size="21" :stroke-width="1.8" />
        <span>{{ t.label }}</span>
      </router-link>
    </nav>
  </div>
</template>
