<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, money, post, resolveAssetUrl } from '../api';
import { useUserStore } from '../stores/user';
import { Toast } from './_toast';
import EmptyState from '../components/EmptyState.vue';
import AppModal from '../components/AppModal.vue';
import { BadgeCheck, ChevronLeft, CircleDollarSign, Minus, Package, Plus, Tags, Wallet } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const product = ref<any>(null);
const selectedImageIndex = ref(0);
const quantity = ref(1);
const loading = ref(true);
const buying = ref(false);
const checkoutOpen = ref(false);
const addresses = ref<any[]>([]);
const selectedAddressId = ref('');

const images = computed(() => (product.value?.images ?? []).filter(Boolean));
const selectedImage = computed(() => images.value[selectedImageIndex.value] ?? '');
const unitPrice = computed(() => Number(product.value?.effectivePrice ?? product.value?.price ?? 0));
const totalPrice = computed(() => unitPrice.value * quantity.value);
const comparePrice = computed(() => Number(product.value?.originalPrice ?? product.value?.price ?? 0));
const stock = computed(() => Math.max(0, Number(product.value?.stock ?? 0)));
const canBuy = computed(() => stock.value > 0 && quantity.value <= stock.value && !buying.value);
const hasMemberPrice = computed(() => Boolean(product.value) && unitPrice.value < Number(product.value?.price ?? 0));
const selectedAddress = computed(() => addresses.value.find((address) => String(address.id) === selectedAddressId.value) ?? null);
const availableQuota = computed(() => Math.max(0, Number(store.profile?.transferQuotaAccount?.available ?? 0)));
const quotaSpend = computed(() => totalPrice.value);
const quotaAfterSpend = computed(() => Math.max(0, availableQuota.value - quotaSpend.value));
const quotaExceedsAvailable = computed(() => Boolean(store.profile?.packageId) && quotaSpend.value > availableQuota.value);

onMounted(async () => {
  loading.value = true;
  const [detail, visibleProducts] = await Promise.all([
    api<any>(`/products/${route.params.id}`).catch(() => null),
    api<any[]>('/products').catch(() => []),
  ]);
  const visibleProduct = visibleProducts.find((item) => String(item.id) === String(route.params.id));
  product.value = detail && visibleProduct
    ? { ...detail, effectivePrice: visibleProduct.effectivePrice ?? detail.price }
    : null;
  loading.value = false;
});

async function beginCheckout() {
  if (!product.value || !canBuy.value) return;
  await store.loadProfile().catch(() => {});
  try {
    addresses.value = await api<any[]>('/me/addresses');
  } catch (e: any) {
    Toast(e.message ?? '收货地址暂时无法加载', 'danger');
    return;
  }
  if (!addresses.value.length) {
    Toast('请先添加收货地址，再继续下单', 'warning');
    router.push('/addresses');
    return;
  }
  selectedAddressId.value = String(addresses.value.find((address) => address.isDefault)?.id ?? addresses.value[0].id);
  checkoutOpen.value = true;
}

async function buy() {
  if (!product.value || !canBuy.value || !selectedAddress.value) return;
  buying.value = true;
  try {
    await post('/orders', {
      type: 4,
      productId: Number(product.value.id),
      addressId: selectedAddressId.value,
      quantity: quantity.value,
      useBalance: true,
    });
    await store.loadProfile().catch(() => {});
    Toast('下单成功', 'success');
    checkoutOpen.value = false;
    router.push('/orders');
  } catch (e: any) {
    const message = e.message ?? '下单失败，请稍后重试';
    if (/钱包可用余额不足|现金支付/.test(message)) {
      Toast('钱包可用余额不足，当前订单无法完成支付。', 'warning');
    } else {
      Toast(message, 'danger');
    }
  } finally {
    buying.value = false;
  }
}
</script>

<template>
  <main class="page product-detail-page">
    <button type="button" class="detail-back" aria-label="返回上一页" @click="router.back()">
      <ChevronLeft :size="19" aria-hidden="true" />
    </button>

    <div v-if="loading" class="skeleton-card detail-loading">
      <div class="skeleton-block skeleton-media" />
      <div class="skeleton-lines"><span class="skeleton-block" /><span class="skeleton-block" /></div>
    </div>
    <div v-else-if="!product" class="detail-empty">
      <EmptyState title="商品暂不可用" description="商品可能已下架或当前会员档不可购买" action-label="返回商城" @action="router.push('/products')" />
    </div>
    <template v-else>
      <section class="detail-hero">
        <img v-if="selectedImage" :src="resolveAssetUrl(selectedImage)" :alt="product.name" />
        <span v-else class="product-card-placeholder"><Package :size="52" stroke-width="1.3" aria-hidden="true" /></span>
        <div v-if="images.length > 1" class="detail-dots" aria-label="商品图片切换">
          <button v-for="(image, index) in images" :key="image" type="button" class="detail-dot"
            :class="{ active: selectedImageIndex === index }" :aria-label="`查看第 ${index + 1} 张图片`"
            @click="selectedImageIndex = index" />
        </div>
      </section>

      <div class="detail-sheet">
        <div class="detail-price-block">
          <div class="detail-price-line">
            <span class="detail-price"><small>¥</small>{{ money(unitPrice) }}</span>
            <span v-if="Number(product.originalPrice) > unitPrice" class="detail-original-price">¥{{ money(product.originalPrice) }}</span>
            <span v-if="hasMemberPrice" class="detail-member-tag">会员专享</span>
          </div>
        </div>

        <h1 class="detail-title">{{ product.name }}</h1>
        <p v-if="product.subtitle" class="detail-subtitle">{{ product.subtitle }}</p>

        <div class="detail-tags">
          <span v-if="hasMemberPrice" class="detail-tag"><BadgeCheck :size="12" aria-hidden="true" />会员专享价</span>
          <span v-if="product.category?.name" class="detail-tag"><Tags :size="12" aria-hidden="true" />{{ product.category.name }}</span>
          <span class="detail-tag"><Package :size="12" aria-hidden="true" />库存 {{ stock }}</span>
        </div>

        <div v-if="images.length > 1" class="detail-thumbnails" aria-label="商品图片">
          <button v-for="(image, index) in images" :key="image" type="button" class="detail-thumbnail"
            :class="{ active: selectedImageIndex === index }" :aria-label="`查看第 ${index + 1} 张图片`"
            @click="selectedImageIndex = index">
            <img :src="resolveAssetUrl(image)" alt="" />
          </button>
        </div>
      </div>

      <section class="detail-card">
        <div class="detail-card-head"><h2>商品信息</h2></div>
        <div class="detail-facts">
          <div><strong>{{ stock }}</strong><span>当前库存</span></div>
          <div><strong>{{ product.category?.name ?? '精选商品' }}</strong><span>所属分类</span></div>
        </div>
        <div class="detail-service">
          <span><CircleDollarSign :size="13" aria-hidden="true" />钱包余额支付</span>
          <span><Wallet :size="13" aria-hidden="true" />钱包消费扣减权益通</span>
          <span v-if="hasMemberPrice"><BadgeCheck :size="13" aria-hidden="true" />会员专属价格</span>
        </div>
      </section>

      <section class="detail-card detail-description">
        <div class="detail-card-head"><h2>商品介绍</h2></div>
        <p>{{ product.description || '暂无详细介绍，请以商品实际信息为准。' }}</p>
        <div v-for="(image, index) in product.details ?? []" :key="`${image}-${index}`" class="detail-description-image">
          <img :src="resolveAssetUrl(image)" :alt="`${product.name}详情图 ${index + 1}`" loading="lazy" />
        </div>
      </section>

      <div class="detail-purchase-bar">
        <div class="purchase-summary">
          <div class="quantity-control" aria-label="购买数量">
            <button type="button" aria-label="减少数量" :disabled="quantity <= 1" @click="quantity = Math.max(1, quantity - 1)"><Minus :size="14" /></button>
            <span>{{ quantity }}</span>
            <button type="button" aria-label="增加数量" :disabled="quantity >= stock" @click="quantity = Math.min(stock, quantity + 1)"><Plus :size="14" /></button>
          </div>
          <div class="purchase-total"><small>合计</small><strong>¥{{ money(totalPrice) }}</strong></div>
        </div>
        <button type="button" class="btn btn-primary purchase-button" :disabled="!canBuy" @click="beginCheckout">
          {{ buying ? '提交中…' : stock ? '立即购买' : '暂时缺货' }}
        </button>
      </div>
    </template>

    <AppModal v-model="checkoutOpen" eyebrow="确认订单" title="确认配送信息"
      description="下单后会保存当前地址快照，用于本笔订单配送。"
      :confirm-loading="buying" :confirm-disabled="!selectedAddress || !canBuy || quotaExceedsAvailable"
      :confirm-text="buying ? '提交中…' : `提交订单 · ¥${money(totalPrice)}`"
      :hint="quotaExceedsAvailable ? '商品金额超过当前可用权益通，请减少购买数量或完成复消后再下单。' : '商品订单会按实际钱包扣款消耗权益通，订单金额不能超过当前可用额度。会员卡订单不消耗权益通。'" @confirm="buy">
      <label class="app-field"><span>选择收货地址</span>
        <select v-model="selectedAddressId" class="input">
          <option v-for="address in addresses" :key="address.id" :value="String(address.id)">
            {{ address.receiver }} · {{ address.phone }} · {{ address.province }}{{ address.city }}{{ address.district }}{{ address.detail }}{{ address.isDefault ? '（默认）' : '' }}
          </option>
        </select>
      </label>
      <div v-if="selectedAddress" class="checkout-address-card">
        <div><strong>{{ selectedAddress.receiver }}</strong><span>{{ selectedAddress.phone }}</span></div>
        <p>{{ selectedAddress.province }}{{ selectedAddress.city }}{{ selectedAddress.district }}{{ selectedAddress.detail }}</p>
      </div>
      <div v-if="store.profile?.packageId && store.profile?.transferQuotaAccount" class="checkout-quota-summary">
        <div><span>预计消耗权益通</span><strong>{{ money(quotaSpend) }}</strong></div>
        <div><span>当前剩余</span><strong>{{ money(availableQuota) }}</strong></div>
        <div><span>支付后预计剩余</span><strong>{{ money(quotaAfterSpend) }}</strong></div>
        <p v-if="quotaExceedsAvailable" class="checkout-quota-summary__warning">订单金额超过可用权益通 {{ money(quotaSpend - availableQuota) }}，请减少购买数量或完成复消后再下单。</p>
      </div>
      <button type="button" class="checkout-address-manage" @click="checkoutOpen = false; router.push('/addresses')">管理收货地址</button>
    </AppModal>
  </main>
</template>

<style scoped>
.detail-purchase-bar { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 12px; }
.purchase-summary { display: grid; min-width: 0; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 8px; }
.purchase-summary .quantity-control { justify-self: start; }
.purchase-total { min-width: 0; flex-direction: row; align-items: baseline; justify-self: center; gap: 5px; white-space: nowrap; }
.purchase-total strong { font-size: 16px; }
.purchase-button { width: 112px; min-width: 0; padding-inline: 10px; }
.checkout-address-card { margin-top: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-2); }
.checkout-address-card > div { display: flex; align-items: center; gap: 10px; color: var(--text); font-size: 12px; }
.checkout-address-card span { color: var(--muted); }
.checkout-address-card p { margin: 7px 0 0; color: var(--text-2); font-size: 11px; line-height: 1.6; }
.checkout-quota-summary { display: grid; gap: 7px; margin-top: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-2); }
.checkout-quota-summary > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 11px; }
.checkout-quota-summary strong { color: var(--text); font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
.checkout-quota-summary > div:last-child strong { color: var(--brand); }
.checkout-quota-summary p { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
.checkout-quota-summary__warning { color: var(--danger, #dc2626) !important; }
.checkout-address-manage { display: inline-flex; margin-top: 10px; padding: 4px 0; border: 0; background: transparent; color: var(--brand); font: inherit; font-size: 11px; cursor: pointer; }
@media (max-width: 390px) {
  .detail-purchase-bar { grid-template-columns: minmax(0, 1fr) 100px; gap: 8px; }
  .purchase-summary { grid-template-columns: 82px minmax(0, 1fr); gap: 8px; }
  .quantity-control button { width: 27px; }
  .quantity-control span { min-width: 22px; }
  .purchase-total strong { font-size: 14px; }
  .purchase-button { width: 100px; padding-inline: 8px; font-size: 12px; }
}
@media (max-width: 350px) {
  .detail-purchase-bar { grid-template-columns: minmax(0, 1fr) 92px; gap: 6px; }
  .purchase-summary { grid-template-columns: 76px minmax(0, 1fr); gap: 6px; }
  .quantity-control button { width: 24px; }
  .quantity-control span { min-width: 20px; }
  .purchase-button { width: 92px; padding-inline: 6px; }
}
</style>
