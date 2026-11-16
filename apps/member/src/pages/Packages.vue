<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money, post } from '../api';
import { Toast } from './_toast';
import PageHeading from '../components/PageHeading.vue';
import EmptyState from '../components/EmptyState.vue';
import AppModal from '../components/AppModal.vue';
import { BadgeCheck, Check, Crown, Sparkles } from 'lucide-vue-next';

const router = useRouter();
const packages = ref<any[]>([]);
const selected = ref<any>(null);
const useEquity = ref(true);
const useBalance = ref(true);
const busy = ref(false);
const loading = ref(true);
const purchaseError = ref('');
const confirmOpen = computed({
  get: () => Boolean(selected.value),
  set: (open: boolean) => { if (!open) selected.value = null; },
});
const errorOpen = computed({
  get: () => Boolean(purchaseError.value),
  set: (open: boolean) => { if (!open) purchaseError.value = ''; },
});

onMounted(async () => {
  packages.value = await api<any[]>('/packages').catch(() => []);
  loading.value = false;
});

async function buy() {
  if (!selected.value || busy.value) return;
  busy.value = true;
  try {
    const order = await post('/orders', {
      type: 1,
      packageId: selected.value.id,
      useEquity: useEquity.value,
      useBalance: useBalance.value,
    });
    Toast(`订单 ${order.orderNo} 已创建，待后台交付后可确认完成`, 'success');
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
    <PageHeading back eyebrow="会员权益" title="会员礼包" subtitle="选择适合自己的会员等级，查看对应权益与服务" />

    <div v-if="loading" class="package-list">
      <div v-for="index in 3" :key="index" class="skeleton-card package-skeleton">
        <div class="skeleton-lines"><span class="skeleton-block" /><span class="skeleton-block" /><span class="skeleton-block" /></div>
      </div>
    </div>
    <div v-else-if="packages.length" class="package-list">
      <article v-for="(item, index) in packages" :key="item.id" class="package-card"
        :class="{ 'package-card--highlight': index === packages.length - 1 }">
        <div class="package-card-head">
          <div>
            <div class="package-level"><Crown :size="14" aria-hidden="true" /> {{ item.level }} 级会员</div>
            <h2 class="package-name">{{ item.name }}</h2>
          </div>
          <div class="package-mark"><Sparkles :size="19" aria-hidden="true" /></div>
        </div>
        <div class="package-price">¥{{ money(item.price) }}</div>
        <div class="package-duration">有效期 {{ item.durationDays }} 天</div>
        <div class="package-benefit">
          <div><BadgeCheck :size="15" aria-hidden="true" /> 获得权益值</div>
          <strong>¥{{ money(item.equityValue) }}</strong>
        </div>
        <div v-if="item.items?.length" class="package-item-list">
          <span v-for="benefit in item.items" :key="benefit.name"><Check :size="13" aria-hidden="true" /> {{ benefit.name }}</span>
        </div>
        <t-button theme="primary" block class="package-buy-button" @click="selected = item">选择此礼包</t-button>
      </article>
    </div>
    <EmptyState v-else title="暂时没有可购买的礼包" description="礼包上架后会在这里展示" action-label="返回商城" @action="router.push('/')" />

    <div class="package-note">
      <BadgeCheck :size="15" aria-hidden="true" />
      <span>下单时可选择使用权益值与钱包余额抵扣；权益值有效期以平台规则为准。</span>
    </div>

    <AppModal v-model="confirmOpen" eyebrow="订单确认" :title="`确认购买 ${selected?.name ?? ''}`"
      description="核对礼包金额与抵扣方式后提交订单。" :confirm-loading="busy"
      :confirm-text="`确认购买 · ¥${money(selected?.price)}`"
      hint="提交后将创建订单；权益值和钱包余额按规则抵扣，剩余现金金额以订单为准。礼包不支持退款。" @confirm="buy">
      <div class="order-summary-row"><span>礼包金额</span><strong>¥{{ money(selected?.price) }}</strong></div>
      <div class="order-summary-row"><span>到账权益值</span><strong class="green">¥{{ money(selected?.equityValue) }}</strong></div>
      <label class="deduction-option">
        <input v-model="useEquity" type="checkbox" />
        <span>使用权益值抵扣</span>
        <span class="deduction-check"><Check :size="13" /></span>
      </label>
      <label class="deduction-option">
        <input v-model="useBalance" type="checkbox" />
        <span>使用钱包余额抵扣</span>
        <span class="deduction-check"><Check :size="13" /></span>
      </label>
    </AppModal>

    <AppModal v-model="errorOpen" eyebrow="支付校验" title="购买未完成" alert
      :description="purchaseError" hint="确认后将前往资产中心。" confirm-text="确认"
      @confirm="purchaseError = ''; router.push('/assets')">
      <div class="app-modal-note">可前往资产中心查看余额与权益值，或调整抵扣方式后重新购买。</div>
    </AppModal>
  </main>
</template>

<style scoped>
.package-list { display: grid; gap: 12px; }
.package-card { padding: 18px; }
.package-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.package-mark { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 12px; background: color-mix(in srgb, var(--accent) 11%, var(--surface)); color: var(--accent); }
.package-name { margin: 7px 0 0; font-size: 17px; }
.package-duration { margin-top: 2px; color: var(--muted); font-size: 10px; }
.package-benefit { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
.package-benefit div { display: inline-flex; align-items: center; gap: 6px; }
.package-benefit strong { color: var(--green); font-size: 13px; }
.package-item-list { display: grid; gap: 7px; margin-top: 12px; }
.package-item-list span { display: inline-flex; align-items: center; gap: 6px; color: var(--text); font-size: 10px; }
.package-item-list svg { color: var(--green); }
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
</style>
