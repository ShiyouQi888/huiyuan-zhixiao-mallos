<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, money } from '../api';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import ProgressBar from '../components/ProgressBar.vue';
import EmptyState from '../components/EmptyState.vue';
import { Award, ArrowUpRight, Check, History } from 'lucide-vue-next';

const rank = ref<any>(null);
const logs = ref<any[]>([]);
const loading = ref(true);
const isTopRank = computed(() => Boolean(rank.value) && rank.value.nextRank === null);

const progress = computed(() => {
  const current = rank.value;
  if (!current?.nextRank?.threshold) return 0;
  return Math.min(100, (Number(current.totalPerformance ?? 0) / Number(current.nextRank.threshold)) * 100);
});

onMounted(async () => {
  const [rankResult, logResult] = await Promise.all([
    api<any>('/me/rank').catch(() => null),
    api<any>('/me/rank/logs?page=1').catch(() => null),
  ]);
  rank.value = rankResult;
  logs.value = logResult?.list ?? [];
  loading.value = false;
});

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}
</script>

<template>
  <main class="page page--partner">
    <PageHeading
      eyebrow="职级体系"
      title="我的等级"
      subtitle="团队累计业绩自动升级，等级与规则由平台实时下发"
    />

    <div v-if="loading" class="card rank-loading">正在读取等级信息…</div>

    <template v-else-if="rank">
      <section class="card card--hero rank-hero">
        <div class="rank-hero-head">
          <div class="rank-identity">
            <span class="rank-eyebrow">当前职级</span>
            <strong class="rank-name">{{ rank.rankName ?? '—' }}</strong>
            <span class="rank-sub">Lv.{{ rank.rankLevel ?? 0 }}</span>
          </div>
          <span class="rank-badge"><Award :size="24" aria-hidden="true" /></span>
        </div>

        <div class="rank-metrics">
          <div class="rank-metric rank-metric--brand">
            <span>团队奖费率</span>
            <strong>{{ (Number(rank.teamRate ?? 0) * 100).toFixed(0) }}%</strong>
          </div>
          <div class="rank-metric rank-metric--green">
            <span>分红池比例</span>
            <strong>{{ (Number(rank.poolRate ?? 0) * 100).toFixed(0) }}%</strong>
          </div>
        </div>

        <div class="rank-performance">
          <span>团队累计业绩</span>
          <strong>¥{{ money(rank.totalPerformance) }}</strong>
        </div>

        <ProgressBar
          v-if="rank.nextRank"
          class="rank-progress"
          :value="progress"
          :label="`距 ${rank.nextRank.name}`"
          :hint="`还差 ¥${money(rank.nextRank.gap)}`"
        />
        <div v-else-if="isTopRank" class="rank-state rank-state--complete">
          <Check :size="14" aria-hidden="true" />已达到最高职级
        </div>
      </section>

      <SectionHeading title="晋升路径" subtitle="达到门槛自动升级，费率随职级提升" />
      <div class="card rank-path">
        <div
          v-for="item in rank.ranks ?? []"
          :key="item.id"
          class="rank-row"
          :class="{ 'rank-row--current': item.level === rank.rankLevel }"
        >
          <div class="rank-row-main">
            <span
              class="rank-step"
              :class="{
                'rank-step--current': item.level === rank.rankLevel,
                'rank-step--passed': item.level < rank.rankLevel,
              }"
            >
              <Check v-if="item.level < rank.rankLevel" :size="13" aria-hidden="true" />
              <template v-else>Lv.{{ item.level }}</template>
            </span>
            <span class="rank-copy">
              <span class="rank-row-name">
                {{ item.name }}
                <span v-if="item.level === rank.rankLevel" class="rank-current-tag">当前</span>
              </span>
              <span class="rank-threshold">团队累计 ¥{{ money(item.threshold) }}</span>
            </span>
          </div>
          <div class="rank-rates">
            <span>团队 {{ (Number(item.teamRate ?? 0) * 100).toFixed(0) }}%</span>
            <span v-if="Number(item.poolRate) > 0">分红 {{ (Number(item.poolRate) * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>

      <SectionHeading title="等级变更记录" subtitle="晋升与人工调整都会留痕" />
      <div v-if="logs.length" class="card card--list">
        <div v-for="log in logs" :key="log.id" class="history-row">
          <span class="history-icon"><History :size="15" aria-hidden="true" /></span>
          <div class="history-copy">
            <div class="history-title">
              {{ log.fromRankName }}<ArrowUpRight :size="13" aria-hidden="true" />{{ log.toRankName }}
            </div>
            <div class="history-meta">
              {{ log.triggerType === 'MANUAL' ? '管理员调整' : '业绩自动晋升' }} · {{ formatDate(log.createdAt) }}
            </div>
          </div>
          <span class="history-value">累计 ¥{{ money(log.totalPerformance) }}</span>
        </div>
      </div>
      <EmptyState
        v-else
        title="暂无等级变更记录"
        description="达成晋升门槛或管理员调整职级后，记录会出现在这里"
        :icon="History"
      />
    </template>

    <div v-else class="card rank-loading">等级信息暂时无法加载，请稍后重试。</div>
  </main>
</template>
