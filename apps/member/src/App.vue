<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from './stores/user';
import { ArrowDownUp, Share2, ShoppingBag, UserRound } from 'lucide-vue-next';

const route = useRoute();
const store = useUserStore();
const showTab = computed(() => !!route.meta.tab);

onMounted(() => { if (store.loggedIn) store.loadProfile().catch(() => {}); });

// 会员端只保留四块：商城 / 分享 / 收益 / 我的
// 等级、团队、分红池、平级/领导奖等已移至独立合伙人端
const allTabs = [
  { path: '/', label: '商城', icon: ShoppingBag, flag: 'product.mall' },
  { path: '/share', label: '分享', icon: Share2, flag: 'referral.center' },
  { path: '/income', label: '收益', icon: ArrowDownUp, flag: 'bonus.detail' },
  { path: '/mine', label: '我的', icon: UserRound, flag: '' },
];
const tabs = computed(() => allTabs.filter((t) => !t.flag || store.has(t.flag)));
</script>

<template>
  <div class="phone-shell">
    <router-view />
    <nav v-if="showTab" class="tabbar">
      <router-link v-for="t in tabs" :key="t.path" :to="t.path" class="tab-item"
        :class="{ active: route.path === t.path }">
        <span class="tab-icon"><component :is="t.icon" :size="21" :stroke-width="1.9" aria-hidden="true" /></span>
        <span>{{ t.label }}</span>
      </router-link>
    </nav>
  </div>
</template>
