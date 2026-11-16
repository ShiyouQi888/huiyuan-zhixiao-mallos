<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, money } from '../api';
import { Award, ArrowUpRight, Check, History } from 'lucide-vue-next';

const rank = ref<any>(null);
const logs = ref<any[]>([]);
const isTopRank = computed(() => Boolean(rank.value) && rank.value.nextRank === null);

onMounted(async () => {
  const [rankResult, logResult] = await Promise.all([
    api<any>('/me/rank').catch(() => null),
    api<any>('/me/rank/logs?page=1').catch(() => null),
  ]);
  rank.value = rankResult;
  logs.value = logResult?.list ?? [];
});

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}
</script>

<template>
  <div class="page partner-rank-page">
    <div class="title">我的等级</div>
    <div class="subtitle">团队累计业绩自动升级，等级与规则由平台实时下发</div>

    <div class="card hero rank-hero">
      <div class="row between">
        <div>
          <div class="subtitle">当前职级</div>
          <div class="gold rank-current-name">{{ rank?.rankName ?? '—' }}</div>
          <div class="subtitle rank-current-level">Lv.{{ rank?.rankLevel ?? 0 }}</div>
        </div>
        <div class="rank-award-icon"><Award :size="26" aria-hidden="true" /></div>
      </div>
      <div class="rank-divider" />
      <div class="row between">
        <div><div class="subtitle">团队奖费率</div><div class="gold rank-rate">{{ (Number(rank?.teamRate ?? 0) * 100).toFixed(0) }}%</div></div>
        <div class="rank-pool"><div class="subtitle">分红池</div><div class="green rank-rate">{{ (Number(rank?.poolRate ?? 0) * 100).toFixed(0) }}%</div></div>
      </div>
      <div class="rank-performance"><span class="subtitle">团队累计业绩</span><strong>¥{{ money(rank?.totalPerformance) }}</strong></div>
      <div v-if="isTopRank" class="rank-state rank-state--complete"><Check :size="14" aria-hidden="true" />已达到最高职级</div>
      <div v-else-if="rank?.nextRank" class="rank-state"><ArrowUpRight :size="14" aria-hidden="true" />距 {{ rank.nextRank.name }} 还差 ¥{{ money(rank.nextRank.gap) }}</div>
    </div>

    <div class="section-title rank-section-title">晋升路径</div>
    <div class="card rank-path">
      <div v-for="item in rank?.ranks ?? []" :key="item.id" class="rank-row" :class="{ 'rank-row--current': item.level === rank?.rankLevel }">
        <div class="row gap-12">
          <span class="rank-level" :class="{ 'rank-level--current': item.level === rank?.rankLevel, 'rank-level--passed': item.level < rank?.rankLevel }">
            <Check v-if="item.level < rank?.rankLevel" :size="13" aria-hidden="true" />
            <template v-else>Lv.{{ item.level }}</template>
          </span>
          <div>
            <div class="rank-name">{{ item.name }}<span v-if="item.level === rank?.rankLevel" class="rank-current-tag">当前</span></div>
            <div class="subtitle rank-threshold">团队累计 ¥{{ money(item.threshold) }}</div>
          </div>
        </div>
        <div class="rank-rates"><span>团队 {{ (Number(item.teamRate ?? 0) * 100).toFixed(0) }}%</span><span v-if="Number(item.poolRate) > 0">分红 {{ (Number(item.poolRate) * 100).toFixed(0) }}%</span></div>
      </div>
    </div>

    <div class="section-title rank-section-title">等级变更记录</div>
    <div v-if="logs.length" class="card rank-history">
      <div v-for="log in logs" :key="log.id" class="rank-history-row">
        <span class="rank-history-icon"><History :size="15" aria-hidden="true" /></span>
        <div class="rank-history-copy">
          <div class="rank-name row gap-8">{{ log.fromRankName }}<ArrowUpRight :size="13" aria-hidden="true" />{{ log.toRankName }}</div>
          <div class="subtitle rank-threshold">{{ log.triggerType === 'MANUAL' ? '管理员调整' : '业绩自动晋升' }} · {{ formatDate(log.createdAt) }}</div>
        </div>
        <span class="subtitle rank-history-performance">累计 ¥{{ money(log.totalPerformance) }}</span>
      </div>
    </div>
    <div v-else class="card rank-history-empty">暂无等级变更记录</div>
  </div>
</template>

<style scoped>
.rank-hero { margin-top: 18px; padding: 20px; }
.rank-current-name { margin-top: 5px; font-size: 23px; font-weight: 700; }
.rank-current-level { margin-top: 3px; font-size: 11px; }
.rank-award-icon { display: flex; width: 50px; height: 50px; align-items: center; justify-content: center; border: 1px solid rgba(212,169,89,.22); border-radius: 15px; background: rgba(212,169,89,.1); color: #e6c27a; }
.rank-divider { height: 1px; margin: 17px 0; background: var(--line); }
.rank-pool { text-align: right; }
.rank-rate { margin-top: 4px; font-size: 19px; font-weight: 700; }
.rank-performance { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 15px; padding-top: 13px; border-top: 1px solid var(--line); font-size: 11px; }
.rank-performance strong { font-size: 13px; font-weight: 650; }
.rank-state { display: flex; align-items: center; gap: 6px; margin-top: 13px; color: var(--gold); font-size: 11px; font-weight: 600; }
.rank-state--complete { color: var(--green); }
.rank-section-title { margin: 22px 0 10px; }
.rank-path { padding: 4px 16px; }
.rank-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 13px 1px; border-bottom: 1px solid var(--line); }
.rank-row:last-child { border-bottom: 0; }
.rank-row--current { margin-inline: -8px; padding-inline: 9px; border-radius: 12px; background: color-mix(in srgb, var(--gold) 8%, var(--surface)); }
.rank-level { display: flex; width: 38px; height: 30px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 9px; background: var(--surface-2); color: var(--muted); font-size: 10px; font-weight: 650; }
.rank-level--current { background: rgba(212,169,89,.15); color: var(--gold); }
.rank-level--passed { background: var(--green-soft); color: var(--green); }
.rank-name { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
.rank-current-tag { padding: 2px 5px; border-radius: 5px; background: rgba(212,169,89,.14); color: var(--gold); font-size: 9px; }
.rank-threshold { margin-top: 4px; font-size: 10px; }
.rank-rates { display: flex; flex: 0 0 auto; flex-direction: column; align-items: flex-end; gap: 3px; color: var(--muted); font-size: 10px; }
.rank-history { padding: 2px 15px; }
.rank-history-row { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.rank-history-row:last-child { border-bottom: 0; }
.rank-history-icon { display: flex; width: 34px; height: 34px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 10px; background: rgba(212,169,89,.12); color: var(--gold); }
.rank-history-copy { min-width: 0; flex: 1; }
.rank-history-performance { flex: 0 0 auto; font-size: 9px; }
.rank-history-empty { padding: 23px 15px; color: var(--muted); font-size: 11px; text-align: center; }
</style>
