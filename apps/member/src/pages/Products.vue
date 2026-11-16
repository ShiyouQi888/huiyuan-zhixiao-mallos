<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import PageHeading from '../components/PageHeading.vue';
import ProductCard from '../components/ProductCard.vue';
import EmptyState from '../components/EmptyState.vue';
import { Search } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const allProducts = ref<any[]>([]);
const keyword = ref(String(route.query.keyword ?? ''));
const categoryId = ref(String(route.query.categoryId ?? ''));
const sortOrder = ref<'recommended' | 'price-asc' | 'price-desc'>('recommended');
const loading = ref(true);

const categories = computed(() => {
  const seen = new Set<string>();
  return allProducts.value.flatMap((product) => {
    const id = product.category?.id ? String(product.category.id) : '';
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ ...product.category }];
  });
});

const keywordMatched = computed(() => {
  const query = keyword.value.trim().toLocaleLowerCase();
  if (!query) return allProducts.value;
  return allProducts.value.filter((product) =>
    `${product.name ?? ''} ${product.subtitle ?? ''} ${product.category?.name ?? ''}`.toLocaleLowerCase().includes(query));
});

const filteredProducts = computed(() => {
  const list = keywordMatched.value.filter((product) => !categoryId.value || String(product.category?.id) === categoryId.value);
  if (sortOrder.value === 'price-asc') return [...list].sort((a, b) => Number(a.effectivePrice ?? a.price) - Number(b.effectivePrice ?? b.price));
  if (sortOrder.value === 'price-desc') return [...list].sort((a, b) => Number(b.effectivePrice ?? b.price) - Number(a.effectivePrice ?? a.price));
  return list;
});

const activeCategory = computed(() => categories.value.find((category) => String(category.id) === categoryId.value));
const activeCategoryName = computed(() => activeCategory.value?.name ?? '全部商品');

watch(() => route.query.keyword, (value) => { keyword.value = String(value ?? ''); });
watch(() => route.query.categoryId, (value) => { categoryId.value = String(value ?? ''); });

onMounted(async () => {
  loading.value = true;
  allProducts.value = await api<any[]>('/products').catch(() => []);
  loading.value = false;
});

function submitSearch() {
  router.replace({
    path: '/products',
    query: {
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
      ...(categoryId.value ? { categoryId: categoryId.value } : {}),
    },
  });
}

function selectCategory(id: string) {
  categoryId.value = id;
  submitSearch();
}

function clearFilters() {
  keyword.value = '';
  categoryId.value = '';
  sortOrder.value = 'recommended';
  router.replace({ path: '/products', query: {} });
}
</script>

<template>
  <main class="page">
    <PageHeading back eyebrow="商品目录" title="商品分类" subtitle="按一级分类浏览商品，价格与库存实时同步" />

    <form class="store-search" role="search" @submit.prevent="submitSearch">
      <Search :size="17" aria-hidden="true" />
      <input v-model="keyword" aria-label="搜索商品" placeholder="搜索商品名称、分类或关键词" />
      <button type="submit">搜索</button>
    </form>

    <div class="category-layout">
      <aside class="category-rail" aria-label="商品一级分类">
        <span class="category-rail-title">分类</span>
        <button type="button" class="category-rail-item" :class="{ active: !categoryId }" @click="selectCategory('')">
          <span>全部商品</span>
        </button>
        <button v-for="category in categories" :key="category.id" type="button" class="category-rail-item"
          :class="{ active: categoryId === String(category.id) }" @click="selectCategory(String(category.id))">
          <span>{{ category.name }}</span>
        </button>
      </aside>

      <section class="category-panel" aria-live="polite">
        <header class="category-panel-head">
          <div class="category-panel-title">
            <h2>{{ activeCategoryName }}</h2>
          </div>
          <div class="sort-control" aria-label="商品排序">
            <button type="button" class="sort-tab" :class="{ active: sortOrder === 'recommended' }" @click="sortOrder = 'recommended'">综合</button>
            <button type="button" class="sort-tab" :class="{ active: sortOrder === 'price-asc' }" aria-label="价格从低到高" @click="sortOrder = 'price-asc'">价格 ↑</button>
            <button type="button" class="sort-tab" :class="{ active: sortOrder === 'price-desc' }" aria-label="价格从高到低" @click="sortOrder = 'price-desc'">价格 ↓</button>
          </div>
        </header>

        <div v-if="loading" class="category-product-grid" aria-label="商品加载中">
          <div v-for="index in 4" :key="index" class="skeleton-card">
            <div class="skeleton-block skeleton-media" />
            <div class="skeleton-lines"><span class="skeleton-block" /><span class="skeleton-block" /></div>
          </div>
        </div>
        <div v-else-if="filteredProducts.length" class="category-product-grid">
          <ProductCard v-for="product in filteredProducts" :key="product.id" :product="product"
            @select="router.push(`/product/${$event.id}`)" />
        </div>
        <EmptyState v-else title="该分类暂无商品" description="切换左侧分类或换个关键词再试试" action-label="查看全部" @action="clearFilters" />
      </section>
    </div>
  </main>
</template>
