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
const loading = ref(true);
const features = useFeaturesStore();
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
  summary.value = await api<any>('/me/bonus').catch(() => null);
  records.value = (await api<any>(`/me/bonus/records${type.value ? `?type=${type.value}` : ''}`).catch(() => null))?.list ?? [];
  loading.value = false;
}
onMounted(load);
</script>

<template>
  <main class="page page--partner">
    <PageHeading
      eyebrow="收益中心"
      title="我的收益"
      subtitle="五条收益线，每日结算，70% 钱包 + 30% 数权"
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

    <SectionHeading title="收益记录" :subtitle="`${type ? NAMES[Number(type)] : '全部类型'} · 共 ${records.length} 条`" />
    <div class="chip-row" role="tablist" aria-label="收益类型筛选">
      <button
        v-for="item in TYPES"
        :key="item.v"
        type="button"
        class="chip"
        :class="{ active: type === item.v }"
        role="tab"
        :aria-selected="type === item.v"
        @click="type = item.v; load()"
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
        :subtitle="`${String(record.settleDate).slice(0, 10)} · 现金 ${money(record.cashAmount)} · 数权 ${money(record.tokenAmount)}`"
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
    <div v-else style="margin-top: 10px">
      <EmptyState
        title="暂无收益记录"
        description="团队业绩结算后，各条收益线会按日写入记录"
        :icon="Wallet"
      />
    </div>
  </main>
</template>
