<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money } from '../api';
import { useUserStore } from '../stores/user';
import SectionHeading from '../components/SectionHeading.vue';
import ProductCard from '../components/ProductCard.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  ArrowRight, BadgePercent, ChefHat, ChevronRight, ClipboardList, Cpu, Gift,
  HeartPulse, LayoutGrid, Moon, Search, Smartphone, Sun, Tags, UserPlus, UserRound,
} from 'lucide-vue-next';
import { applyThemeMode, getThemeMode, type ThemeMode } from '../theme';

const router = useRouter();
const store = useUserStore();
const products = ref<any[]>([]);
const packages = ref<any[]>([]);
const keyword = ref('');
const loading = ref(true);
const productError = ref('');
const themeMode = ref<ThemeMode>(getThemeMode());
const nextMode = computed(() => themeMode.value === 'dark' ? 'light' : 'dark');

function toggleTheme() {
  themeMode.value = nextMode.value;
  applyThemeMode(themeMode.value);
}

const categories = computed(() => {
  const seen = new Set<string>();
  return products.value.flatMap((product) => {
    if (!product.category?.id || seen.has(String(product.category.id))) return [];
    seen.add(String(product.category.id));
    return [product.category];
  });
});

const featuredProducts = computed(() => {
  const featured = products.value.filter((product) => product.isFeatured);
  return (featured.length ? featured : products.value).slice(0, 4);
});
const recommendedProducts = computed(() => {
  const featuredIds = new Set(featuredProducts.value.map((product) => String(product.id)));
  return products.value.filter((product) => !featuredIds.has(String(product.id))).slice(0, 4);
});
const greetingName = computed(() => store.profile?.nickname ?? '会员');
const canManagePackages = computed(() => store.has('package.purchase') || store.has('member.upgrade') || store.has('member.repurchase'));

async function load() {
  loading.value = true;
  productError.value = '';
  await store.loadProfile().catch(() => {});
  const [productResult, packageResult] = await Promise.allSettled([
    api<any[]>('/products'),
    canManagePackages.value ? api<any[]>('/packages') : Promise.resolve([]),
  ]);
  products.value = productResult.status === 'fulfilled' ? productResult.value : [];
  packages.value = packageResult.status === 'fulfilled' ? packageResult.value : [];
  if (productResult.status === 'rejected') productError.value = '商品加载失败，请检查网络后重试';
  loading.value = false;
}

onMounted(load);

function search() {
  router.push({ path: '/products', query: keyword.value.trim() ? { keyword: keyword.value.trim() } : {} });
}

function openCategory(categoryId: string) {
  router.push({ path: '/products', query: { categoryId } });
}

function categoryIcon(category: any) {
  const name = String(category?.name ?? '');
  if (/数码|电器/.test(name)) return Cpu;
  if (/健康|养护/.test(name)) return HeartPulse;
  if (/厨房|家居|家用/.test(name)) return ChefHat;
  if (/手机|配件|通讯/.test(name)) return Smartphone;
  return Tags;
}

const categoryTones = ['quick-icon--gold', 'quick-icon--green', 'quick-icon--blue', 'quick-icon--ink'];
function categoryTone(index: number) {
  return categoryTones[index % categoryTones.length];
}
</script>

<template>
  <main class="page page--store">
    <section class="home-intro">
      <div class="home-hello">
        <small>太阳线会员 · 欢迎回来</small>
        <strong>Hi，{{ greetingName }}</strong>
      </div>
      <div class="home-intro-actions">
        <button type="button" class="home-theme-button"
          :aria-label="`切换为${nextMode === 'light' ? '浅色' : '深色'}主题`"
          :title="`切换为${nextMode === 'light' ? '浅色' : '深色'}主题`" @click="toggleTheme">
          <Sun v-if="themeMode === 'dark'" :size="17" aria-hidden="true" />
          <Moon v-else :size="17" aria-hidden="true" />
        </button>
        <router-link to="/mine" class="home-avatar" aria-label="个人中心" title="个人中心">
          <UserRound :size="19" aria-hidden="true" />
        </router-link>
      </div>
    </section>

    <form class="store-search" role="search" @submit.prevent="search">
      <Search :size="17" aria-hidden="true" />
      <input v-model="keyword" aria-label="搜索商品" placeholder="搜索商品名称或关键词" />
      <button type="submit">搜索</button>
    </form>

    <section class="store-promo" aria-label="会员商城权益">
      <div class="store-promo-copy">
        <div class="store-promo-label"><BadgePercent :size="13" aria-hidden="true" /> 会员专享</div>
        <h2>精选好物 权益直抵</h2>
        <p>会员专属价格，结算时使用钱包余额</p>
        <button type="button" class="promo-action" @click="router.push('/products')">
          开始选购 <ArrowRight :size="12" aria-hidden="true" />
        </button>
      </div>
      <div class="store-promo-art"><Gift :size="30" stroke-width="1.5" aria-hidden="true" /></div>
    </section>

    <section class="home-nav-block" aria-label="快捷入口与分类">
      <nav class="quick-grid">
        <router-link to="/products" class="quick-item">
          <span class="quick-icon"><LayoutGrid :size="20" aria-hidden="true" /></span>全部商品
        </router-link>
        <router-link v-if="canManagePackages" to="/packages" class="quick-item">
          <span class="quick-icon quick-icon--gold"><Gift :size="20" aria-hidden="true" /></span>会员礼包与升级
        </router-link>
        <router-link to="/orders" class="quick-item">
          <span class="quick-icon quick-icon--blue"><ClipboardList :size="20" aria-hidden="true" /></span>我的订单
        </router-link>
        <router-link to="/share" class="quick-item">
          <span class="quick-icon"><UserPlus :size="20" aria-hidden="true" /></span>邀请好友
        </router-link>
      </nav>

      <template v-if="categories.length">
        <div class="home-nav-divider" />
        <div class="home-category">
          <div class="home-nav-head">
            <strong><Tags :size="14" aria-hidden="true" />分类选购</strong>
            <router-link to="/products">全部商品 <ChevronRight :size="13" aria-hidden="true" /></router-link>
          </div>
          <div class="home-category-grid">
            <button v-for="(category, index) in categories" :key="category.id" type="button" class="home-category-item"
              @click="openCategory(String(category.id))">
              <span class="quick-icon" :class="categoryTone(index)">
                <component :is="categoryIcon(category)" :size="20" aria-hidden="true" />
              </span>
              <span class="home-category-label">{{ category.name }}</span>
            </button>
          </div>
        </div>
      </template>
    </section>

    <section>
      <SectionHeading title="会员精选" subtitle="会员专属价，支持余额与权益抵扣" action-label="查看全部" to="/products" />
      <div v-if="loading" class="product-grid" aria-label="商品加载中">
        <div v-for="index in 4" :key="index" class="skeleton-card">
          <div class="skeleton-block skeleton-media" />
          <div class="skeleton-lines"><span class="skeleton-block" /><span class="skeleton-block" /></div>
        </div>
      </div>
      <div v-else-if="featuredProducts.length" class="product-grid">
        <ProductCard v-for="product in featuredProducts" :key="product.id" :product="product"
          @select="router.push(`/product/${$event.id}`)" />
      </div>
      <EmptyState v-else :title="productError ? '商品暂时无法加载' : '暂时没有上架商品'"
        :description="productError || '新商品上架后会第一时间展示在这里'" action-label="重新加载" @action="load" />
    </section>

    <section v-if="!loading && recommendedProducts.length">
      <SectionHeading title="为你推荐" subtitle="会员商城精选好物" action-label="更多商品" to="/products" />
      <div class="product-grid">
        <ProductCard v-for="product in recommendedProducts" :key="product.id" :product="product"
          @select="router.push(`/product/${$event.id}`)" />
      </div>
    </section>

    <section v-if="canManagePackages && packages.length">
      <SectionHeading title="会员礼包与升级" subtitle="查看可购买、升级或复消的有效档位" action-label="全部礼包" to="/packages" />
      <div class="package-grid">
        <button v-for="(item, index) in packages.slice(0, 2)" :key="item.id" type="button"
          class="package-card package-card--home" :class="{ 'package-card--highlight': index === 1 }"
          @click="router.push('/packages')">
          <span class="package-home-top"><span class="package-level"><BadgePercent :size="13" aria-hidden="true" /> {{ item.level }} 级会员</span><ChevronRight :size="15" aria-hidden="true" /></span>
          <span class="package-name">{{ item.name }}</span>
          <span class="package-home-price">¥{{ money(item.price) }}<small>礼包价格</small></span>
          <span class="package-benefit">包含 <strong>¥{{ money(item.equityValue) }}</strong> 转账额度</span>
          <span class="package-home-duration">有效期 {{ item.durationDays }} 天</span>
        </button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-intro-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
.home-theme-button {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
}
.home-avatar {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--brand) 26%, var(--line));
  border-radius: 50%;
  background: var(--surface);
  color: var(--brand);
  text-decoration: none;
}
</style>
