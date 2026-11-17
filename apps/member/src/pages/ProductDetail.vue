<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, money, post, resolveAssetUrl } from '../api';
import { useUserStore } from '../stores/user';
import { Toast } from './_toast';
import EmptyState from '../components/EmptyState.vue';
import AppModal from '../components/AppModal.vue';
import { BadgeCheck, ChevronLeft, CircleDollarSign, Minus, Package, Plus, Tags, TrendingUp, Wallet } from 'lucide-vue-next';

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
const unitPv = computed(() => Math.max(0, Number(product.value?.pv ?? 0)));
const totalPv = computed(() => unitPv.value * quantity.value);
const isProductRepurchase = computed(() => Boolean(store.profile?.packageId));
const repurchaseQuota = computed(() => isProductRepurchase.value ? totalPv.value * 3 : 0);
const comparePrice = computed(() => Number(product.value?.originalPrice ?? product.value?.price ?? 0));
const stock = computed(() => Math.max(0, Number(product.value?.stock ?? 0)));
const canBuy = computed(() => stock.value > 0 && quantity.value <= stock.value && !buying.value);
const hasMemberPrice = computed(() => Boolean(product.value) && unitPrice.value < Number(product.value?.price ?? 0));
const selectedAddress = computed(() => addresses.value.find((address) => String(address.id) === selectedAddressId.value) ?? null);

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

        <div class="detail-pv-highlight" aria-label="商品计酬PV">
          <span class="detail-pv-highlight__icon"><TrendingUp :size="17" aria-hidden="true" /></span>
          <span class="detail-pv-highlight__copy">
            <small>商品计酬 PV</small>
            <strong>{{ unitPv.toLocaleString('zh-CN') }}<span> PV / 件</span></strong>
          </span>
          <span class="detail-pv-highlight__hint">按购买数量累计</span>
        </div>

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
          <div><strong>{{ unitPv.toLocaleString('zh-CN') }}</strong><span>单件 PV</span></div>
          <div><strong>{{ product.category?.name ?? '精选商品' }}</strong><span>所属分类</span></div>
        </div>
        <div class="detail-service">
          <span><CircleDollarSign :size="13" aria-hidden="true" />钱包余额支付</span>
          <span><Wallet :size="13" aria-hidden="true" />权益通仅用于钱包转出</span>
          <span><TrendingUp :size="13" aria-hidden="true" />业绩按PV × 件数计入</span>
          <span><BadgeCheck :size="13" aria-hidden="true" />支付成功后按PV × 3发放权益通</span>
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
          <div class="purchase-totals">
            <div class="purchase-total-metric purchase-total-metric--money">
              <small>合计金额</small><strong>¥{{ money(totalPrice) }}</strong>
            </div>
            <div class="purchase-total-metric purchase-total-metric--pv">
              <small>本单计酬 PV</small><strong>{{ totalPv.toLocaleString('zh-CN') }} <span>PV</span></strong>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-primary purchase-button" :disabled="!canBuy" @click="beginCheckout">
          {{ buying ? '提交中…' : stock ? '立即购买' : '暂时缺货' }}
        </button>
      </div>
    </template>

    <AppModal v-model="checkoutOpen" eyebrow="确认订单" title="确认配送信息"
      description="下单后会保存当前地址快照，用于本笔订单配送。"
      :confirm-loading="buying" :confirm-disabled="!selectedAddress || !canBuy"
      :confirm-text="buying ? '提交中…' : `提交订单 · ¥${money(totalPrice)}`"
      hint="商品订单使用钱包余额支付，不消耗权益通；权益通仅在钱包转出时消耗。" @confirm="buy">
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
      <div v-if="isProductRepurchase" class="checkout-quota-summary">
        <div><span>会员商品订单奖励权益通</span><strong>+{{ money(repurchaseQuota) }}</strong></div>
        <p>按本单 {{ totalPv.toLocaleString('zh-CN') }} PV × 3 计算，支付成功后即时入账。</p>
      </div>
      <button type="button" class="checkout-address-manage" @click="checkoutOpen = false; router.push('/addresses')">管理收货地址</button>
    </AppModal>
  </main>
</template>

<style scoped>
.detail-purchase-bar { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 12px; }
.detail-pv-highlight { display: flex; min-height: 58px; align-items: center; gap: 10px; margin-top: 12px; padding: 9px 11px; border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--line)); border-radius: 12px; background: linear-gradient(100deg, color-mix(in srgb, var(--brand) 16%, var(--surface)), color-mix(in srgb, var(--brand) 5%, var(--surface))); }
.detail-pv-highlight__icon { display: inline-flex; width: 34px; height: 34px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 10px; background: var(--brand); color: #fff; }
.detail-pv-highlight__copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.detail-pv-highlight__copy small { color: var(--text-2); font-size: 10px; font-weight: 600; }
.detail-pv-highlight__copy strong { color: var(--brand); font-family: var(--font-num); font-size: 18px; font-weight: 800; line-height: 1.2; white-space: nowrap; }
.detail-pv-highlight__copy strong span { font-family: var(--font-sans); font-size: 10px; font-weight: 650; }
.detail-pv-highlight__hint { margin-left: auto; color: var(--muted); font-size: 9px; white-space: nowrap; }
.purchase-summary { display: grid; min-width: 0; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 8px; }
.purchase-summary .quantity-control { justify-self: start; }
.purchase-totals { display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: center; gap: 6px; }
.purchase-total-metric { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
.purchase-total-metric small { overflow: hidden; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.purchase-total-metric strong { overflow: hidden; color: var(--brand); font-family: var(--font-num); font-size: 14px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.purchase-total-metric--pv { padding: 5px 7px; border: 1px solid color-mix(in srgb, var(--brand) 24%, var(--line)); border-radius: 8px; background: var(--brand-soft); }
.purchase-total-metric--pv strong span { font-family: var(--font-sans); font-size: 9px; font-weight: 700; }
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
  .purchase-totals { gap: 4px; }
  .quantity-control button { width: 27px; }
  .quantity-control span { min-width: 22px; }
  .purchase-total-metric strong { font-size: 12px; }
  .purchase-total-metric--pv { padding-inline: 5px; }
  .purchase-button { width: 100px; padding-inline: 8px; font-size: 12px; }
}
@media (max-width: 350px) {
  .detail-purchase-bar { grid-template-columns: minmax(0, 1fr) 92px; gap: 6px; }
  .purchase-summary { grid-template-columns: 76px minmax(0, 1fr); gap: 6px; }
  .purchase-totals { gap: 3px; }
  .purchase-total-metric small { font-size: 8px; }
  .purchase-total-metric strong { font-size: 11px; }
  .detail-pv-highlight__hint { display: none; }
  .quantity-control button { width: 24px; }
  .quantity-control span { min-width: 20px; }
  .purchase-button { width: 92px; padding-inline: 6px; }
}
</style>
