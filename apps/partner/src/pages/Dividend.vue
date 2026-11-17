<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, money } from '../api';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import ListRow from '../components/ListRow.vue';
import EmptyState from '../components/EmptyState.vue';
import { Coins } from 'lucide-vue-next';

const records = ref<any[]>([]);
const rank = ref<any>(null);
const loading = ref(true);
const poolRate = computed(() => (Number(rank.value?.poolRate ?? 0) * 100).toFixed(0));

onMounted(async () => {
  const [r, b] = await Promise.all([
    api<any>('/me/rank').catch(() => null),
    api<any>('/me/bonus/records?type=5').catch(() => null),
  ]);
  rank.value = r; records.value = b?.list ?? []; loading.value = false;
});
</script>

<template>
  <main class="page page--partner">
    <PageHeading
      back
      eyebrow="合伙人权益"
      title="分红池"
      subtitle="按当前职级参与全网分红池分配"
    />

    <section class="card card--hero rank-hero">
      <div class="rank-hero-head">
        <div class="rank-identity">
          <span class="rank-eyebrow">当前职级分红比例</span>
          <strong class="rank-name">{{ poolRate }}%</strong>
          <span class="rank-sub">{{ rank?.rankName ?? '—' }} · Lv.{{ rank?.rankLevel ?? 0 }}</span>
        </div>
        <span class="rank-badge"><Coins :size="23" aria-hidden="true" /></span>
      </div>
      <div class="note-card">
        池子 = <strong>全网当日计酬PV × 该级比例</strong>，按 1 PV = ¥1 计算奖金基数后，在该等级人数间平均分配。等级恰好等于该级才可参与，人数为 0 时不分配。
      </div>
    </section>

    <SectionHeading title="分红记录" :subtitle="`共 ${records.length} 条，按结算日汇总`" />
    <div v-if="loading" class="card card--list">
      <div class="skeleton-block" style="height: 14px; margin: 16px 0" />
      <div class="skeleton-block" style="height: 14px; margin: 16px 0" />
    </div>
    <div v-else-if="records.length" class="card card--list">
      <ListRow
        v-for="record in records"
        :key="record.id"
        title="全网分红池"
        :subtitle="String(record.settleDate).slice(0, 10)"
        :value="`+¥${money(record.amount)}`"
        value-tone="green"
      >
        <template #icon>
          <span class="list-row-icon list-row-icon--gold"><Coins :size="15" aria-hidden="true" /></span>
        </template>
      </ListRow>
    </div>
    <EmptyState
      v-else
      title="暂无分红记录"
      description="达到对应职级并产生全网分红后，分配记录会出现在这里"
      :icon="Coins"
    />
  </main>
</template>
