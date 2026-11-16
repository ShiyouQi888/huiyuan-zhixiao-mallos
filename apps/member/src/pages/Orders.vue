<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, money, post } from '../api';
import { Toast } from './_toast';
import PageHeading from '../components/PageHeading.vue';
import EmptyState from '../components/EmptyState.vue';
import { BadgeCheck, ClipboardList, Clock3, Package, RefreshCw, Truck } from 'lucide-vue-next';

type OrderFilter = 'all' | 'pending' | 'shipping' | 'completed';
const orders = ref<any[]>([]);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref('');
const confirmingNo = ref('');
const filter = ref<OrderFilter>('all');
const page = ref(1);
const total = ref(0);
const pageSize = ref(20);

const filters: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'shipping', label: '待确认' },
  { key: 'completed', label: '已完成' },
];
const visibleOrders = computed(() => orders.value.filter((order) => {
  if (filter.value === 'pending') return order.status === 0 || order.status === 1;
  if (filter.value === 'shipping') return order.status === 2;
  if (filter.value === 'completed') return order.status === 3;
  return true;
}));

function statusText(status: number) {
  return ({ 0: '待支付', 1: '待后台交付', 2: '待确认收货', 3: '已完成' } as Record<number, string>)[status] ?? '处理中';
}
function statusIcon(status: number) {
  return status === 2 ? Truck : status === 3 ? BadgeCheck : status === 0 || status === 1 ? Clock3 : Package;
}
function orderTitle(order: any) {
  return order.items?.[0]?.name ?? order.package?.name ?? ({ 1: '会员礼包', 2: '会员升级', 3: '会员复购', 4: '商城商品' } as Record<number, string>)[order.type] ?? '商城订单';
}
function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await api<{ list: any[]; total: number; page: number; pageSize: number }>('/orders?page=1');
    orders.value = result.list ?? [];
    total.value = Number(result.total ?? orders.value.length);
    page.value = Number(result.page ?? 1);
    pageSize.value = Number(result.pageSize ?? 20);
  } catch (e: any) {
    error.value = e.message ?? '订单暂时无法加载';
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (loadingMore.value || orders.value.length >= total.value) return;
  loadingMore.value = true;
  try {
    const result = await api<{ list: any[]; total: number; page: number; pageSize: number }>(`/orders?page=${page.value + 1}`);
    orders.value = [...orders.value, ...(result.list ?? [])];
    total.value = Number(result.total ?? total.value);
    page.value = Number(result.page ?? page.value + 1);
    pageSize.value = Number(result.pageSize ?? pageSize.value);
  } catch (e: any) {
    Toast(e.message ?? '加载失败，请稍后重试', 'danger');
  } finally {
    loadingMore.value = false;
  }
}

async function confirmReceipt(order: any) {
  confirmingNo.value = order.orderNo;
  try {
    await post(`/orders/${order.orderNo}/confirm`);
    Toast('已确认收货，订单完成', 'success');
    await load();
  } catch (e: any) {
    Toast(e.message ?? '操作失败，请稍后重试', 'danger');
  } finally {
    confirmingNo.value = '';
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <PageHeading back eyebrow="订单中心" title="我的订单" subtitle="查看订单进度、支付构成与商品信息" />

    <div class="order-filter-list" role="tablist" aria-label="订单状态筛选">
      <button v-for="item in filters" :key="item.key" type="button" role="tab"
        class="filter-chip order-filter" :class="{ active: filter === item.key }"
        :aria-selected="filter === item.key" @click="filter = item.key">
        {{ item.label }}
      </button>
    </div>
    <div v-if="!loading && !error && total" class="order-result-count">已加载 {{ Math.min(orders.length, total) }} / {{ total }} 笔订单</div>

    <div v-if="loading" class="order-list" aria-label="订单加载中">
      <div v-for="index in 3" :key="index" class="skeleton-card order-skeleton">
        <div class="skeleton-lines"><span class="skeleton-block" /><span class="skeleton-block" /><span class="skeleton-block" /></div>
      </div>
    </div>
    <section v-else-if="error" class="order-error" role="alert">
      <div class="empty-state-icon"><RefreshCw :size="23" aria-hidden="true" /></div>
      <h2>订单加载失败</h2><p>{{ error }}</p>
      <t-button theme="primary" variant="outline" size="small" @click="load">重新加载</t-button>
    </section>
    <div v-else-if="visibleOrders.length" class="order-list">
      <article v-for="order in visibleOrders" :key="order.orderNo" class="order-card">
        <header class="order-card-head">
          <div class="order-number"><ClipboardList :size="14" aria-hidden="true" /> 订单号 {{ order.orderNo }}</div>
          <span class="order-status" :class="`order-status--${order.status}`">
            <component :is="statusIcon(order.status)" :size="13" aria-hidden="true" />{{ statusText(order.status) }}
          </span>
        </header>
        <div class="order-card-date">下单时间 {{ formatDate(order.createdAt) }}</div>

        <div class="order-item-row">
          <div class="order-item-icon"><Package :size="21" stroke-width="1.7" aria-hidden="true" /></div>
          <div class="order-item-copy">
            <strong>{{ orderTitle(order) }}</strong>
            <span v-if="order.items?.[0]">数量 {{ order.items[0].quantity ?? 1 }}</span>
            <span v-else>{{ ({ 1: '会员新购', 2: '会员升级', 3: '会员复购', 4: '商品消费' } as Record<number, string>)[order.type] ?? '会员订单' }}</span>
          </div>
          <div class="order-total"><small>订单金额</small><strong>¥{{ money(order.amount) }}</strong></div>
        </div>

        <div class="order-payment">
          <span>权益抵扣 <strong>¥{{ money(order.equityDeduct) }}</strong></span>
          <span>余额抵扣 <strong>¥{{ money(order.balanceDeduct) }}</strong></span>
          <span>现金支付 <strong>¥{{ money(order.cashPay) }}</strong></span>
        </div>
        <footer class="order-card-foot">
          <span v-if="order.status === 3" class="order-complete-note"><BadgeCheck :size="14" aria-hidden="true" /> 订单已完成</span>
          <span v-else class="order-foot-hint">{{ order.status === 2 ? '商品已交付，请确认收货' : order.status === 1 ? '订单已提交，等待后台交付' : '请完成支付后等待订单处理' }}</span>
          <t-button v-if="order.status === 2" theme="primary" size="small" :loading="confirmingNo === order.orderNo"
            @click="confirmReceipt(order)">确认收货</t-button>
        </footer>
      </article>
      <t-button v-if="orders.length < total" theme="default" variant="outline" block :loading="loadingMore" class="load-more-button" @click="loadMore">
        {{ loadingMore ? '正在加载…' : '加载更多订单' }}
      </t-button>
    </div>
    <EmptyState v-else title="暂无相关订单" :description="filter === 'all' ? '选购商品或会员礼包后，订单会显示在这里' : '当前状态下没有订单记录'"
      :action-label="filter === 'all' ? '前往商城' : '查看全部订单'" @action="filter === 'all' ? $router.push('/') : filter = 'all'" />
  </main>
</template>

<style scoped>
.order-filter-list { display: flex; gap: 7px; overflow-x: auto; margin: -4px -14px 14px; padding: 4px 14px 6px; scrollbar-width: none; }
.order-filter-list::-webkit-scrollbar { display: none; }
.order-filter { gap: 6px; }
.order-result-count { margin: -4px 0 11px; color: var(--muted); font-size: 10px; }
.order-list { display: grid; gap: 11px; }
.order-card { overflow: hidden; padding: 15px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); box-shadow: var(--shadow-card); }
.order-card-head, .order-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.order-number { display: inline-flex; min-width: 0; align-items: center; gap: 6px; overflow: hidden; color: var(--muted); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.order-number svg { flex: 0 0 auto; color: var(--accent); }
.order-status { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; color: var(--muted); font-size: 10.5px; font-weight: 650; }
.order-status--0, .order-status--1 { color: var(--amber); }
.order-status--2 { color: var(--accent); }
.order-status--3 { color: var(--green); }
.order-card-date { margin-top: 6px; color: var(--muted); font-size: 10px; }
.order-item-row { display: flex; min-width: 0; align-items: center; gap: 10px; margin-top: 13px; padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.order-item-icon { display: flex; width: 44px; height: 44px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 12px; background: var(--brand-soft); color: var(--brand); }
.order-item-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; }
.order-item-copy strong { overflow: hidden; color: var(--text); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.order-item-copy span, .order-total small { color: var(--muted); font-size: 10px; }
.order-total { display: flex; flex: 0 0 auto; flex-direction: column; align-items: flex-end; gap: 4px; }
.order-total strong { color: var(--text); font-family: var(--font-num); font-size: 13px; }
.order-payment { display: flex; flex-wrap: wrap; gap: 5px 12px; padding: 10px 0; color: var(--muted); font-size: 10px; }
.order-payment strong { color: var(--text); font-weight: 600; }
.order-card-foot { min-height: 32px; border-top: 1px solid var(--line); padding-top: 10px; }
.order-foot-hint, .order-complete-note { display: inline-flex; align-items: center; gap: 5px; color: var(--muted); font-size: 10px; }
.order-complete-note { color: var(--green); }
.order-skeleton .skeleton-lines { gap: 12px; padding: 16px; }
.order-skeleton .skeleton-lines span { height: 13px; }
.order-error { display: flex; min-height: 220px; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); text-align: center; }
.order-error h2 { margin: 13px 0 4px; font-size: 14px; }
.order-error p { margin: 0 0 14px; color: var(--muted); font-size: 11px; }
.load-more-button { margin-top: 2px; }
</style>
