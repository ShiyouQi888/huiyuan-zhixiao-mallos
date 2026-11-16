<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, money } from '../api';
import { Award, ArrowUpRight, Check, History } from 'lucide-vue-next';

const rank = ref<any>(null);
const logs = ref<any[]>([]);
const loading = ref(true);
const logPage = ref(1);
const logTotal = ref(0);
const logPageSize = 20;
const isTopRank = computed(() => Boolean(rank.value) && rank.value.nextRank === null);
const logPages = computed(() => Math.max(1, Math.ceil(logTotal.value / logPageSize)));

async function loadLogs(page = logPage.value) {
  logPage.value = page;
  const result = await api<any>(`/me/rank/logs?page=${page}`).catch(() => null);
  logs.value = result?.list ?? [];
  logTotal.value = result?.total ?? 0;
}

onMounted(async () => {
  const [rankResult, logResult] = await Promise.allSettled([
    api<any>('/me/rank'),
    api<any>('/me/rank/logs?page=1'),
  ]);
  rank.value = rankResult.status === 'fulfilled' ? rankResult.value : null;
  logs.value = logResult.status === 'fulfilled' ? logResult.value.list ?? [] : [];
  logTotal.value = logResult.status === 'fulfilled' ? logResult.value.total ?? 0 : 0;
  loading.value = false;
});

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}
</script>

<template>
  <div class="page rank-page">
    <div class="title">我的等级</div>
    <div class="subtitle">职级配置、团队业绩与等级变更记录实时同步</div>

    <div v-if="loading" class="card rank-loading" aria-live="polite">正在读取等级信息…</div>
    <template v-else-if="rank">
      <div class="card hero rank-hero">
        <div class="row between">
          <div>
            <div class="subtitle">当前职级 · {{ rank.rankName }}</div>
            <div class="rank-level">Lv.{{ rank.rankLevel }}</div>
          </div>
          <div class="icon-tile rank-icon"><Award :size="28" aria-hidden="true" /></div>
        </div>
        <div class="divider rank-divider" />
        <div class="rank-metrics">
          <div>
            <div class="subtitle">团队奖费率</div>
            <div class="accent rank-metric-value">{{ (Number(rank.teamRate ?? 0) * 100).toFixed(0) }}%</div>
          </div>
          <div class="rank-metric-right">
            <div class="subtitle">分红池比例</div>
            <div class="green rank-metric-value">{{ (Number(rank.poolRate ?? 0) * 100).toFixed(0) }}%</div>
          </div>
        </div>
        <div class="rank-performance">
          <span class="subtitle">团队累计业绩</span>
          <strong>¥{{ money(rank.totalPerformance) }}</strong>
        </div>
        <div v-if="isTopRank" class="rank-top-state"><Check :size="14" aria-hidden="true" />已达到最高职级</div>
        <div v-else-if="rank.nextRank" class="rank-next-state">
          <ArrowUpRight :size="14" aria-hidden="true" />
          距离 {{ rank.nextRank.name }} 还差 ¥{{ money(rank.nextRank.gap) }} 团队业绩
        </div>
        <div v-if="rank.peerBonusLocked" class="tag row gap-8 rank-peer-lock"><Check :size="14" aria-hidden="true" />平级奖资格已永久锁定</div>
      </div>

      <div class="section-title rank-section-title">等级晋升路径</div>
      <div class="card rank-path">
        <div v-for="item in rank.ranks ?? []" :key="item.id" class="rank-path-row" :class="{ 'rank-path-row--current': item.level === rank.rankLevel }">
          <div class="rank-path-main">
            <div class="rank-path-level" :class="{ 'rank-path-level--current': item.level === rank.rankLevel, 'rank-path-level--passed': item.level < rank.rankLevel }">
              <Check v-if="item.level < rank.rankLevel" :size="13" aria-hidden="true" />
              <span v-else>Lv.{{ item.level }}</span>
            </div>
            <div class="rank-path-copy">
              <div class="rank-path-name">{{ item.name }}<span v-if="item.level === rank.rankLevel" class="rank-current-label">当前</span></div>
              <div class="subtitle rank-threshold">团队累计 ¥{{ money(item.threshold) }}</div>
            </div>
          </div>
          <div class="rank-path-rates">
            <span>团队 {{ (Number(item.teamRate ?? 0) * 100).toFixed(0) }}%</span>
            <span v-if="Number(item.poolRate) > 0">分红 {{ (Number(item.poolRate) * 100).toFixed(0) }}%</span>
          </div>
        </div>
      </div>

      <div class="section-title rank-section-title">等级变更记录</div>
      <div v-if="logs.length" class="card rank-history">
        <div v-for="log in logs" :key="log.id" class="rank-history-row">
          <div class="rank-history-icon"><History :size="15" aria-hidden="true" /></div>
          <div class="rank-history-copy">
            <div class="rank-history-title">{{ log.fromRankName }}<ArrowUpRight :size="13" aria-hidden="true" />{{ log.toRankName }}</div>
            <div class="subtitle rank-history-meta">{{ log.triggerType === 'MANUAL' ? '管理员调整' : '业绩自动晋升' }} · {{ formatDate(log.createdAt) }}</div>
          </div>
          <div class="rank-history-performance">累计 ¥{{ money(log.totalPerformance) }}</div>
        </div>
      </div>
      <div v-else class="card rank-history-empty">暂无等级变更记录</div>

      <div v-if="logPages > 1" class="rank-pager">
        <button type="button" :disabled="logPage <= 1" @click="loadLogs(logPage - 1)">上一页</button>
        <span>{{ logPage }} / {{ logPages }} · 共 {{ logTotal }} 条</span>
        <button type="button" :disabled="logPage >= logPages" @click="loadLogs(logPage + 1)">下一页</button>
      </div>
    </template>
    <div v-else class="card rank-history-empty">等级信息暂时无法加载，请稍后重试。</div>
  </div>
</template>

<style scoped>
.rank-loading { margin-top: 16px; padding: 28px 18px; color: var(--muted); font-size: 12px; text-align: center; }
.rank-hero { margin-top: 16px; padding: 20px; }
.rank-level { margin-top: 5px; font-size: 28px; font-weight: 700; letter-spacing: -.03em; }
.rank-icon { width: 52px; height: 52px; border-radius: 16px; }
.rank-divider { margin: 18px 0; }
.rank-metrics { display: flex; align-items: center; justify-content: space-between; }
.rank-metric-right { text-align: right; }
.rank-metric-value { margin-top: 4px; font-size: 19px; font-weight: 700; }
.rank-performance { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 11px; }
.rank-performance strong { font-size: 13px; font-weight: 650; }
.rank-top-state, .rank-next-state { display: flex; align-items: center; gap: 6px; margin-top: 14px; color: var(--green); font-size: 11px; font-weight: 600; }
.rank-next-state { color: var(--accent); }
.rank-peer-lock { margin-top: 12px; }
.rank-section-title { margin: 22px 0 10px; }
.rank-path { padding: 4px 16px; }
.rank-path-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 2px; border-bottom: 1px solid var(--line); }
.rank-path-row:last-child { border-bottom: 0; }
.rank-path-row--current { margin-inline: -8px; padding-inline: 10px; border-radius: 12px; background: color-mix(in srgb, var(--accent) 7%, var(--surface)); }
.rank-path-main { display: flex; min-width: 0; align-items: center; gap: 10px; }
.rank-path-level { display: flex; width: 38px; height: 30px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 9px; background: var(--surface-2); color: var(--muted); font-size: 10px; font-weight: 600; }
.rank-path-level--current { background: var(--accent-soft); color: var(--accent); }
.rank-path-level--passed { background: var(--green-soft); color: var(--green); }
.rank-path-copy { min-width: 0; }
.rank-path-name { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; }
.rank-current-label { padding: 2px 5px; border-radius: 5px; background: var(--accent-soft); color: var(--accent); font-size: 9px; font-weight: 600; }
.rank-threshold { margin-top: 3px; font-size: 10px; }
.rank-path-rates { display: flex; flex: 0 0 auto; flex-direction: column; align-items: flex-end; gap: 3px; color: var(--muted); font-size: 10px; }
.rank-history { padding: 2px 15px; }
.rank-history-row { display: flex; align-items: center; gap: 10px; padding: 13px 0; border-bottom: 1px solid var(--line); }
.rank-history-row:last-child { border-bottom: 0; }
.rank-history-icon { display: flex; width: 34px; height: 34px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent); }
.rank-history-copy { min-width: 0; flex: 1; }
.rank-history-title { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600; }
.rank-history-meta { margin-top: 4px; font-size: 9px; }
.rank-history-performance { flex: 0 0 auto; color: var(--muted); font-size: 10px; }
.rank-history-empty { padding: 24px 16px; color: var(--muted); font-size: 11px; text-align: center; }
.rank-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; color: var(--muted); font-size: 10.5px; }
.rank-pager button { min-height: 26px; padding: 0 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 10.5px; cursor: pointer; }
.rank-pager button:disabled { opacity: .45; cursor: default; }
</style>
