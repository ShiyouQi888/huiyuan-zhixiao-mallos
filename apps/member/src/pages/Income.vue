<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money } from '../api';
import { ChevronRight, WalletCards } from 'lucide-vue-next';
import { useUserStore } from '../stores/user';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import EmptyState from '../components/EmptyState.vue';

const router = useRouter();
const store = useUserStore();
const summary = ref<any>(null);
const periods = ref<any>(null);
const records = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const type = ref('');
const loading = ref(true);
const failed = ref(false);

const NAMES: Record<number, string> = { 1: '直推奖励', 2: '团队奖励', 3: '平级奖励', 4: '领导奖励', 5: '分红池', 6: '手工调整' };
const ALL_TYPES = [
  { v: '', l: '全部' },
  { v: '1', l: '直推' },
  { v: '2', l: '团队' },
  { v: '3', l: '平级' },
  { v: '4', l: '领导' },
  { v: '5', l: '分红' },
];
const TYPES = computed(() => ALL_TYPES.filter((item) => item.v !== '5' || store.has('rank.dividend')));
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const activeLines = computed(() => (summary.value?.byType ?? []).filter((b: any) => Number(b.amount) > 0).length);

async function load() {
  loading.value = true;
  failed.value = false;
  const query = `${type.value ? `?type=${type.value}&` : '?'}page=${page.value}`;
  const [s, p, r] = await Promise.all([
    api<any>('/me/bonus').catch(() => null),
    api<any>('/me/bonus/periods').catch(() => null),
    api<any>(`/me/bonus/records${query}`).catch(() => null),
  ]);
  if (!s && !r) failed.value = true;
  summary.value = s;
  periods.value = p;
  records.value = r?.list ?? [];
  total.value = r?.total ?? 0;
  loading.value = false;
}

function filter(next: string) {
  type.value = next;
  page.value = 1;
  load();
}

function goto(next: number) {
  if (next < 1 || next > pages.value) return;
  page.value = next;
  load();
}

onMounted(async () => {
  await store.loadProfile().catch(() => {});
  await load();
});
</script>

<template>
  <main class="page">
    <PageHeading eyebrow="收益中心" title="我的收益" subtitle="查看累计奖金、今日本月汇总与结算记录" />

    <section class="income-hero">
      <div class="income-hero-head">
        <span>累计收益</span>
        <button type="button" class="income-asset-link" @click="router.push('/assets')">资产中心 <ChevronRight :size="13" aria-hidden="true" /></button>
      </div>
      <div class="income-total"><small>¥</small>{{ money(summary?.total) }}</div>
      <div class="income-split">
        <div><span>今日收益</span><strong>¥{{ money(periods?.today?.amount) }}</strong></div>
        <div><span>本月收益</span><strong>¥{{ money(periods?.month?.amount) }}</strong></div>
      </div>
      <p v-if="periods" class="income-period-note">
        今日 {{ periods.today.count }} 笔 · 本月 {{ periods.month.count }} 笔 · 统计至 {{ periods.date }}
      </p>
    </section>

    <!-- 去资产 -->
    <div class="card row between income-assets-row" @click="router.push('/assets')">
      <div class="row gap-12">
        <span class="income-assets-icon"><WalletCards :size="19" aria-hidden="true" /></span>
        <div>
          <div style="font-size:13px;font-weight:600">查看我的资产</div>
          <div class="subtitle" style="font-size:10.5px;margin-top:3px">钱包余额 · 权益值 · 转账</div>
        </div>
      </div>
      <ChevronRight :size="18" class="muted" aria-hidden="true" />
    </div>

    <!-- 收益明细 -->
    <SectionHeading title="收益明细" subtitle="按结算日期查看各条收益线发放情况" />

    <div class="income-filter" role="tablist" aria-label="收益类型筛选">
      <button
        v-for="item in TYPES"
        :key="item.v"
        type="button"
        role="tab"
        class="income-filter-btn"
        :class="{ active: type === item.v }"
        :aria-selected="type === item.v"
        @click="filter(item.v)"
      >
        {{ item.l }}
      </button>
    </div>

    <div v-if="loading" class="income-record-list">
      <div v-for="n in 4" :key="n" class="skeleton-block" style="height: 14px; margin: 16px 0" />
    </div>

    <div v-else-if="failed" class="income-error">
      <p>收益数据加载失败</p>
      <button type="button" @click="load">重新加载</button>
    </div>

    <div v-else-if="records.length" class="income-record-list">
      <div v-for="r in records" :key="r.id" class="list-row row between">
        <div>
          <div style="font-size:13px">{{ NAMES[r.type] ?? '奖金' }}</div>
          <div class="subtitle" style="font-size:11px;margin-top:4px">{{ String(r.settleDate).slice(0, 10) }}</div>
        </div>
        <div style="text-align:right">
          <div class="green" style="font-size:15px;font-weight:650">+¥{{ money(r.amount) }}</div>
          <div class="subtitle" style="font-size:10px;margin-top:3px">现金 {{ money(r.cashAmount) }} · 数权 {{ money(r.tokenAmount) }}</div>
        </div>
      </div>
    </div>
    <EmptyState v-else title="暂无收益记录" description="奖金完成结算后，会在这里展示详细记录" />

    <div v-if="!loading && !failed && pages > 1" class="income-pager">
      <button type="button" :disabled="page <= 1" @click="goto(page - 1)">上一页</button>
      <span>{{ page }} / {{ pages }} · 共 {{ total }} 条</span>
      <button type="button" :disabled="page >= pages" @click="goto(page + 1)">下一页</button>
    </div>

    <div class="subtitle" style="text-align:center;margin-top:20px;font-size:11px">
      已入账 {{ activeLines }} 条收益线 · 团队、平级、领导奖与分红池由合伙人中心统一展示
    </div>
  </main>
</template>

<style scoped>
.income-hero {
  position: relative;
  overflow: hidden;
  padding: 18px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 96% -14%, rgba(255, 255, 255, 0.26), transparent 46%),
    linear-gradient(120deg, #ff8a4c 0%, #f45a1f 54%, #e3410c 100%);
  color: #fff;
  box-shadow: 0 12px 28px rgba(224, 66, 12, 0.22);
}
.income-hero::after {
  position: absolute;
  right: -28px;
  bottom: -72px;
  width: 148px;
  height: 148px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  content: '';
  pointer-events: none;
}
.income-hero-head { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; color: rgba(255, 255, 255, 0.82); font-size: 11px; font-weight: 600; }
.income-asset-link { display: inline-flex; align-items: center; gap: 1px; padding: 4px 0; border: 0; background: transparent; color: rgba(255, 255, 255, 0.82); font: inherit; font-size: 10.5px; cursor: pointer; }
.income-total { position: relative; z-index: 1; margin-top: 8px; color: #fff; font-family: var(--font-num); font-size: 36px; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; }
.income-total small { margin-right: 3px; font-size: 19px; font-weight: 700; }
.income-split { position: relative; z-index: 1; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.22); }
.income-split div { display: flex; flex-direction: column; gap: 4px; }
.income-split span { color: rgba(255, 255, 255, 0.75); font-size: 10px; }
.income-split strong { color: #fff; font-family: var(--font-num); font-size: 17px; font-weight: 750; }
.income-period-note { position: relative; z-index: 1; margin: 11px 0 0; color: rgba(255, 255, 255, 0.72); font-size: 9.5px; }
.income-assets-row { padding: 15px 16px; cursor: pointer; }
.income-assets-icon { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 12px; background: var(--brand-soft); color: var(--brand); }
.income-filter { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 5px; margin: -3px 0 12px; padding: 5px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface); box-shadow: var(--shadow-card); }
.income-filter-btn { height: 32px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font: inherit; font-size: 11px; font-weight: 600; white-space: nowrap; cursor: pointer; }
.income-filter-btn.active { background: var(--brand-soft); color: var(--brand); }
.income-record-list { padding: 3px 14px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); box-shadow: var(--shadow-card); }
.income-error { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 26px 16px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); color: var(--muted); font-size: 11.5px; }
.income-error button { min-height: 28px; padding: 0 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); color: var(--brand); font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.income-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; color: var(--muted); font-size: 10.5px; }
.income-pager button { min-height: 26px; padding: 0 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 10.5px; cursor: pointer; }
.income-pager button:disabled { opacity: .45; cursor: default; }
</style>
