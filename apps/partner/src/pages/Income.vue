<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, money } from '../api';
import { useFeaturesStore } from '../stores/features';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import ListRow from '../components/ListRow.vue';
import EmptyState from '../components/EmptyState.vue';
import {
  Award, Coins, Handshake, SlidersHorizontal, TrendingUp, UserPlus, Users, Wallet,
} from 'lucide-vue-next';

const summary = ref<any>(null);
const records = ref<any[]>([]);
const type = ref('');
const page = ref(1);
const total = ref(0);
const pageSize = 20;
const loading = ref(true);
const failed = ref(false);
const features = useFeaturesStore();
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const recordSubtitle = computed(() => `${type.value ? NAMES[Number(type.value)] : '全部类型'} · 共 ${total.value} 条`);
const allTypes = [
  { v: '', l: '全部' }, { v: '1', l: '直推' }, { v: '2', l: '团队' },
  { v: '3', l: '平级' }, { v: '4', l: '领导' }, { v: '5', l: '分红' }, { v: '6', l: '调整' },
];
const TYPES = computed(() => allTypes.filter((item) => item.v !== '5' || features.has('rank.dividend')));
const NAMES: Record<number, string> = { 1:'直推奖',2:'团队奖',3:'平级奖',4:'领导奖',5:'分红池',6:'手工调整' };
const META: Record<number, { icon: any; tone: string }> = {
  1: { icon: UserPlus, tone: 'brand' },
  2: { icon: Users, tone: 'info' },
  3: { icon: Handshake, tone: 'gold' },
  4: { icon: Award, tone: 'green' },
  5: { icon: Coins, tone: 'gold' },
  6: { icon: SlidersHorizontal, tone: 'neutral' },
};

async function load() {
  loading.value = true;
  failed.value = false;
  const query = `${type.value ? `?type=${type.value}&` : '?'}page=${page.value}`;
  const [s, r] = await Promise.all([
    api<any>('/me/bonus').catch(() => null),
    api<any>(`/me/bonus/records${query}`).catch(() => null),
  ]);
  if (!s && !r) failed.value = true;
  summary.value = s;
  records.value = r?.list ?? [];
  total.value = r?.total ?? 0;
  loading.value = false;
}

function filter(value: string) {
  type.value = value;
  page.value = 1;
  load();
}

function goto(next: number) {
  if (next < 1 || next > pages.value) return;
  page.value = next;
  load();
}
onMounted(load);
</script>

<template>
  <main class="page page--partner">
    <PageHeading
      eyebrow="收益中心"
      title="我的收益"
      subtitle="五条收益线，每日结算，70% 钱包 + 30% 太阳值"
    />

    <section class="card card--hero income-hero">
      <span class="income-label">累计收益</span>
      <div class="income-total"><small>¥</small>{{ money(summary?.total) }}</div>
      <div class="income-breakdown">
        <div v-for="item in summary?.byType ?? []" :key="item.type" class="income-breakdown-item">
          <span>{{ NAMES[item.type] }}</span>
          <strong>¥{{ money(item.amount) }}</strong>
        </div>
      </div>
    </section>

    <SectionHeading title="收益记录" :subtitle="recordSubtitle" />
    <div class="chip-row" role="tablist" aria-label="收益类型筛选">
      <button
        v-for="item in TYPES"
        :key="item.v"
        type="button"
        class="chip"
        :class="{ active: type === item.v }"
        role="tab"
        :aria-selected="type === item.v"
        @click="filter(item.v)"
      >
        {{ item.l }}
      </button>
    </div>

    <div v-if="loading" class="card card--list" style="margin-top: 10px">
      <div class="skeleton-block" style="height: 14px; margin: 16px 0" />
      <div class="skeleton-block" style="height: 14px; margin: 16px 0" />
      <div class="skeleton-block" style="height: 14px; margin: 16px 0" />
    </div>
    <div v-else-if="records.length" class="card card--list" style="margin-top: 10px">
      <ListRow
        v-for="record in records"
        :key="record.id"
        :title="NAMES[record.type]"
        :subtitle="`${String(record.settleDate).slice(0, 10)} · 现金 ${money(record.cashAmount)} · 太阳值 ${money(record.tokenAmount)}`"
        :value="`+¥${money(record.amount)}`"
        value-tone="green"
      >
        <template #icon>
          <span class="list-row-icon" :class="`list-row-icon--${META[record.type]?.tone ?? 'brand'}`">
            <component :is="META[record.type]?.icon ?? TrendingUp" :size="15" aria-hidden="true" />
          </span>
        </template>
      </ListRow>
    </div>
    <div v-else-if="failed" class="card income-error">
      <p>收益数据加载失败</p>
      <button type="button" @click="load">重新加载</button>
    </div>
    <div v-else style="margin-top: 10px">
      <EmptyState
        title="暂无收益记录"
        description="团队业绩结算后，各条收益线会按日写入记录"
        :icon="Wallet"
      />
    </div>

    <div v-if="!loading && !failed && pages > 1" class="income-pager">
      <button type="button" :disabled="page <= 1" @click="goto(page - 1)">上一页</button>
      <span>{{ page }} / {{ pages }} · 共 {{ total }} 条</span>
      <button type="button" :disabled="page >= pages" @click="goto(page + 1)">下一页</button>
    </div>
  </main>
</template>

<style scoped>
.income-error { display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 10px; padding: 26px 16px; color: var(--muted, #8b909c); font-size: 11.5px; }
.income-error button { min-height: 28px; padding: 0 14px; border: 1px solid var(--line, rgba(17, 24, 39, 0.1)); border-radius: 8px; background: rgba(255, 90, 31, 0.08); color: #ff5a1f; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; }
.income-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 14px; color: var(--muted, #8b909c); font-size: 10.5px; }
.income-pager button { min-height: 26px; padding: 0 11px; border: 1px solid var(--line, rgba(17, 24, 39, 0.1)); border-radius: 8px; background: var(--surface, #fff); color: var(--text, #17181c); font: inherit; font-size: 10.5px; cursor: pointer; }
.income-pager button:disabled { opacity: .45; cursor: default; }
</style>
