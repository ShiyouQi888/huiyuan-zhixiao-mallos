<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money, post, resolveAssetUrl } from '../api';
import { useUserStore } from '../stores/user';
import { Toast } from './_toast';
import PageHeading from '../components/PageHeading.vue';
import EmptyState from '../components/EmptyState.vue';
import AppModal from '../components/AppModal.vue';
import { BadgeCheck, Check, Crown, Package, ShoppingBag, Sparkles } from 'lucide-vue-next';

const router = useRouter();
const store = useUserStore();
const packages = ref<any[]>([]);
const profile = ref<any>(null);
const selected = ref<{ item: any; mode: 'purchase' | 'upgrade' | 'repurchase' } | null>(null);
const useBalance = ref(true);
const busy = ref(false);
const loading = ref(true);
const loadError = ref('');
const purchaseError = ref('');
const confirmOpen = computed({
  get: () => Boolean(selected.value),
  set: (open: boolean) => { if (!open) selected.value = null; },
});
const errorOpen = computed({
  get: () => Boolean(purchaseError.value),
  set: (open: boolean) => { if (!open) purchaseError.value = ''; },
});
const currentPackage = computed(() => profile.value?.package ?? null);
const actionModes = computed(() => {
  if (!profile.value?.packageId) return store.has('package.purchase') ? ['purchase'] : [];
  const modes: Array<'upgrade' | 'repurchase'> = [];
  if (store.has('member.upgrade')) modes.push('upgrade');
  if (profile.value.transferQuotaAccount?.repurchaseRequired && store.has('member.repurchase')) modes.push('repurchase');
  return modes;
});
const selectedModeLabel = computed(() => ({
  purchase: '购买礼包', upgrade: '升级档位', repurchase: '复消礼包',
}[selected.value?.mode ?? 'purchase']));
const selectedAmount = computed(() => selected.value?.mode === 'upgrade'
  ? Number(selected.value.item.price) - Number(currentPackage.value?.price ?? 0)
  : Number(selected.value?.item.price ?? 0));
const selectedQuota = computed(() => selected.value?.mode === 'upgrade'
  ? Math.max(0, Number(selected.value.item.pv ?? 0) - Number(currentPackage.value?.pv ?? 0)) * 3
  : Number(selected.value?.item.pv ?? 0) * 3);
const visiblePackages = computed(() => packages.value.filter((item) => {
  if (!profile.value?.packageId) return actionModes.value.includes('purchase');
  const currentLevel = Number(currentPackage.value?.level ?? 0);
  return (actionModes.value.includes('upgrade') && Number(item.level) > currentLevel)
    || actionModes.value.includes('repurchase');
}));
const profileStatusLabel = computed(() => {
  if (!currentPackage.value) return '尚未开通会员档位';
  return profile.value?.transferQuotaAccount?.repurchaseRequired ? '权益通已用完 · 复消商品或礼包可解锁' : '权益通可用';
});
const canUseBalance = computed(() => store.has('wallet.account'));

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    await store.loadProfile();
    profile.value = store.profile;
    useBalance.value = canUseBalance.value;
    packages.value = await api<any[]>('/packages');
  } catch (e: any) {
    loadError.value = e.message ?? '会员档位加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function modesFor(item: any): Array<'purchase' | 'upgrade' | 'repurchase'> {
  if (!profile.value?.packageId) return store.has('package.purchase') ? ['purchase'] : [];
  const modes: Array<'upgrade' | 'repurchase'> = [];
  if (store.has('member.upgrade') && Number(item.level) > Number(currentPackage.value?.level ?? 0)) modes.push('upgrade');
  if (profile.value.transferQuotaAccount?.repurchaseRequired && store.has('member.repurchase')) modes.push('repurchase');
  return modes;
}

function select(item: any, mode: 'purchase' | 'upgrade' | 'repurchase') {
  selected.value = { item, mode };
}

async function buy() {
  if (!selected.value || busy.value) return;
  busy.value = true;
  try {
    const order = await post('/orders', {
      type: selected.value.mode === 'upgrade' ? 2 : selected.value.mode === 'repurchase' ? 3 : 1,
      packageId: selected.value.item.id,
      useBalance: useBalance.value,
    });
    await store.loadProfile().catch(() => {});
    Toast(`${selectedModeLabel.value}订单 ${order.orderNo} 已创建`, 'success');
    selected.value = null;
    router.push('/orders');
  } catch (e: any) {
    selected.value = null;
    purchaseError.value = e.message ?? '购买失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="page">
    <PageHeading back eyebrow="会员权益" title="会员档位" subtitle="查看当前档位，并按会员状态完成新购、升级或复消" />

    <section v-if="profile" class="current-membership">
      <div class="current-membership-copy">
        <span class="current-membership-label">当前状态</span>
        <strong>{{ currentPackage?.name ?? '普通会员' }}</strong>
        <span>{{ profileStatusLabel }}</span>
      </div>
      <div v-if="currentPackage" class="current-membership-meta">
        <span>档位价格 <strong>¥{{ money(currentPackage.price) }}</strong></span>
        <span>可用权益通 <strong>{{ money(profile.transferQuotaAccount?.available ?? 0) }}</strong></span>
      </div>
    </section>

    <div v-if="loading" class="package-list">
      <div v-for="index in 3" :key="index" class="skeleton-card package-skeleton">
        <div class="skeleton-lines"><span class="skeleton-block" /><span class="skeleton-block" /><span class="skeleton-block" /></div>
      </div>
    </div>
    <div v-else-if="visiblePackages.length" class="package-list">
      <article v-for="(item, index) in packages" :key="item.id" class="package-card"
        v-show="modesFor(item).length > 0"
        :class="{ 'package-card--highlight': index === packages.length - 1 }">
        <div class="package-card-head">
          <div>
            <div class="package-level"><Crown :size="14" aria-hidden="true" /> {{ item.level }} 级会员</div>
            <h2 class="package-name">{{ item.name }}</h2>
          </div>
          <div class="package-mark"><Sparkles :size="19" aria-hidden="true" /></div>
        </div>
        <div class="package-price">¥{{ money(item.price) }}</div>
        <div class="package-duration">一次买断 · 终身有效 · 计酬 PV {{ Number(item.pv ?? 0).toLocaleString('zh-CN') }}</div>
        <div class="package-benefit">
          <div><BadgeCheck :size="15" aria-hidden="true" /> 权益通</div>
          <strong>{{ money(Number(item.pv ?? 0) * 3) }}</strong>
        </div>
        <section class="package-products" :aria-label="`${item.name}关联商品`">
          <div class="package-products-heading">
            <span><ShoppingBag :size="14" aria-hidden="true" /> 该档位可购商品</span>
            <span>{{ item.products?.length ?? 0 }} 件</span>
          </div>
          <div v-if="item.products?.length" class="package-product-list">
            <div v-for="product in item.products" :key="product.id" class="package-product">
              <img v-if="product.images?.[0]" :src="resolveAssetUrl(product.images[0])" :alt="product.name" loading="lazy" />
              <span v-else class="package-product-placeholder"><Package :size="20" aria-hidden="true" /></span>
              <div class="package-product-copy">
                <strong>{{ product.name }}</strong>
                <span v-if="product.subtitle">{{ product.subtitle }}</span>
                <span class="package-product-price">¥{{ money(product.effectivePrice) }}<del v-if="Number(product.originalPrice) > Number(product.effectivePrice)">¥{{ money(product.originalPrice) }}</del></span>
              </div>
              <span v-if="product.stock <= 0" class="package-product-stock">缺货</span>
            </div>
          </div>
          <div v-else class="package-products-empty">该档位暂未关联可购商品</div>
        </section>
        <div v-if="item.items?.length" class="package-item-list">
          <span v-for="benefit in item.items" :key="benefit.name"><Check :size="13" aria-hidden="true" /> {{ benefit.name }}</span>
        </div>
        <div class="package-actions">
          <t-button v-for="mode in modesFor(item)" :key="mode" theme="primary" block class="package-buy-button"
            @click="select(item, mode)">
            {{ mode === 'purchase' ? `开通 · ¥${money(item.price)}` : mode === 'upgrade' ? `升级差额 · ¥${money(Number(item.price) - Number(currentPackage?.price ?? 0))}` : `复消 · ¥${money(item.price)}` }}
          </t-button>
        </div>
      </article>
    </div>
    <EmptyState v-else-if="!loading && !loadError" title="当前没有可执行的档位操作"
      :description="currentPackage ? '当前权益通仍可用，或已处于最高可升级档位。权益通用完后可复消礼包或普通商品解锁。' : '暂无可开通的档位，请联系平台运营人员。'"
      action-label="返回商城" @action="router.push('/')" />
    <EmptyState v-else-if="loadError" title="档位信息暂时无法加载" :description="loadError" action-label="重新加载" @action="load" />

    <div class="package-note">
      <BadgeCheck :size="15" aria-hidden="true" />
      <span>权益通只在钱包转出时消耗。礼包新购与复消按档位PV × 3发放，升级按PV差额 × 3补充；会员普通商品订单支付成功后按订单PV × 3发放。</span>
    </div>

    <AppModal v-model="confirmOpen" eyebrow="订单确认" :title="`${selectedModeLabel} · ${selected?.item.name ?? ''}`"
      description="核对本次订单金额与新增权益通后提交订单。" :confirm-loading="busy"
      :confirm-text="`确认提交 · ¥${money(selectedAmount)}`"
      :hint="selected?.mode === 'upgrade' ? '支付成功后按新旧档位PV差额 × 3补充权益通。' : selected?.mode === 'repurchase' ? '支付成功后按所选档位PV × 3追加权益通。' : '支付成功后按所选档位PV × 3增加权益通。'" @confirm="buy">
      <div class="order-summary-row"><span>{{ selected?.mode === 'upgrade' ? '档位差额' : '档位金额' }}</span><strong>¥{{ money(selectedAmount) }}</strong></div>
      <div class="order-summary-row"><span>{{ selected?.mode === 'upgrade' ? '补充权益通' : '新增权益通' }}</span><strong class="green">{{ money(selectedQuota) }}</strong></div>
      <div v-if="selected?.mode === 'upgrade'" class="order-summary-row"><span>升级后档位</span><strong>{{ selected?.item.name }}</strong></div>
      <label v-if="canUseBalance" class="deduction-option">
        <input v-model="useBalance" type="checkbox" />
        <span>使用钱包余额抵扣</span>
        <span class="deduction-check"><Check :size="13" /></span>
      </label>
    </AppModal>

    <AppModal v-model="errorOpen" eyebrow="订单处理" title="操作未完成" alert
      :description="purchaseError" hint="确认后返回档位页面。" confirm-text="知道了"
      @confirm="purchaseError = ''">
      <div class="app-modal-note">请核对当前档位状态、资产余额与平台开放的业务权限后重试。</div>
    </AppModal>
  </main>
</template>

<style scoped>
.package-list { display: grid; gap: 12px; }
.current-membership { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; padding: 14px 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.current-membership-copy { display: grid; gap: 3px; }
.current-membership-copy strong { color: var(--text); font-size: 14px; }
.current-membership-copy > span:last-child { color: var(--muted); font-size: 10px; }
.current-membership-label { color: var(--accent); font-size: 9px; font-weight: 700; letter-spacing: .08em; }
.current-membership-meta { display: grid; gap: 5px; color: var(--muted); font-size: 10px; text-align: right; }
.current-membership-meta strong { color: var(--text); margin-left: 4px; }
.package-card { padding: 18px; }
.package-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.package-mark { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 12px; background: color-mix(in srgb, var(--accent) 11%, var(--surface)); color: var(--accent); }
.package-name { margin: 7px 0 0; font-size: 17px; }
.package-duration { margin-top: 2px; color: var(--muted); font-size: 10px; }
.package-benefit { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
.package-benefit div { display: inline-flex; align-items: center; gap: 6px; }
.package-benefit strong { color: var(--green); font-size: 13px; }
.package-products { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.package-products-heading { display: flex; align-items: center; justify-content: space-between; color: var(--muted); font-size: 10px; }
.package-products-heading > span:first-child { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); font-weight: 650; }
.package-products-heading svg { color: var(--accent); }
.package-product-list { display: grid; gap: 8px; margin-top: 9px; }
.package-product { display: flex; min-width: 0; align-items: center; gap: 9px; padding: 7px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface-2); }
.package-product > img, .package-product-placeholder { display: flex; width: 42px; height: 42px; flex: 0 0 auto; align-items: center; justify-content: center; overflow: hidden; border-radius: 8px; background: var(--surface); color: var(--muted); object-fit: cover; }
.package-product-copy { display: grid; min-width: 0; flex: 1; gap: 3px; }
.package-product-copy strong { overflow: hidden; color: var(--text); font-size: 10.5px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.package-product-copy > span:not(.package-product-price) { overflow: hidden; color: var(--muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.package-product-price { display: flex; align-items: baseline; gap: 6px; color: var(--accent); font-family: var(--font-num); font-size: 10px; font-weight: 700; }
.package-product-price del { color: var(--muted); font-size: 9px; font-weight: 400; }
.package-product-stock { flex: 0 0 auto; color: var(--danger); font-size: 9px; }
.package-products-empty { margin-top: 9px; padding: 12px 8px; border: 1px dashed var(--line-strong); border-radius: 10px; color: var(--muted); font-size: 9.5px; text-align: center; }
.package-item-list { display: grid; gap: 7px; margin-top: 12px; }
.package-item-list span { display: inline-flex; align-items: center; gap: 6px; color: var(--text); font-size: 10px; }
.package-item-list svg { color: var(--green); }
.package-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.package-buy-button { margin-top: 15px; }
.package-note { display: flex; gap: 8px; margin-top: 16px; color: var(--muted); font-size: 10px; line-height: 1.6; }
.package-note svg { flex: 0 0 auto; color: var(--accent); }
.package-skeleton .skeleton-lines { gap: 12px; padding: 18px; }
.package-skeleton .skeleton-lines span { height: 14px; }
.order-summary-row { display: flex; justify-content: space-between; padding: 9px 0; color: var(--muted); font-size: 11px; }
.order-summary-row strong { color: var(--text); font-size: 12px; }
.deduction-option { display: flex; min-height: 44px; align-items: center; gap: 10px; border-top: 1px solid var(--line); color: var(--text); font-size: 11px; cursor: pointer; }
.deduction-option input { position: absolute; opacity: 0; }
.deduction-check { display: inline-flex; width: 18px; height: 18px; align-items: center; justify-content: center; margin-left: auto; border: 1px solid var(--line); border-radius: 6px; color: transparent; }
.deduction-option input:checked + span + .deduction-check { border-color: var(--accent); background: var(--accent); color: #fff; }
@media (max-width: 390px) { .current-membership { align-items: flex-start; flex-direction: column; } .current-membership-meta { grid-template-columns: repeat(2, auto); text-align: left; } }
</style>
