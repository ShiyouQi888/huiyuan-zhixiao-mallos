<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Package } from 'lucide-vue-next';
import { money, resolveAssetUrl } from '../api';

const props = defineProps<{ product: any }>();
const emit = defineEmits<{ select: [product: any] }>();
const imageFailed = ref(false);

const imageUrl = computed(() => resolveAssetUrl(props.product?.images?.[0]));
const memberPrice = computed(() => Number(props.product?.effectivePrice ?? props.product?.price ?? 0));
const listPrice = computed(() => Number(props.product?.price ?? 0));
const hasMemberPrice = computed(() => memberPrice.value < listPrice.value);
const stock = computed(() => Number(props.product?.stock ?? 0));

watch(imageUrl, () => { imageFailed.value = false; });
</script>

<template>
  <button type="button" class="product-card" :aria-label="`查看商品：${product.name}`" @click="emit('select', product)">
    <span class="product-card-media">
      <img v-if="imageUrl && !imageFailed" :src="imageUrl" :alt="product.name" loading="lazy" @error="imageFailed = true" />
      <span v-else class="product-card-placeholder"><Package :size="34" stroke-width="1.3" aria-hidden="true" /></span>
      <span v-if="hasMemberPrice" class="product-card-badge">会员价</span>
      <span v-else-if="product.isNew" class="product-card-badge product-card-badge--new">新品</span>
    </span>
    <span class="product-card-body">
      <span class="product-card-name">{{ product.name }}</span>
      <span v-if="product.subtitle" class="product-card-subtitle">{{ product.subtitle }}</span>
      <span class="product-card-price-row">
        <span class="product-card-price">¥{{ money(memberPrice) }}</span>
        <span v-if="Number(product.originalPrice) > memberPrice" class="product-card-original">¥{{ money(product.originalPrice) }}</span>
      </span>
      <span v-if="stock <= 10" class="product-card-meta">
        <span v-if="stock <= 0" class="product-card-stock product-card-stock--empty">暂时缺货</span>
        <span v-else class="product-card-stock product-card-stock--low">仅剩 {{ stock }} 件</span>
      </span>
    </span>
  </button>
</template>
