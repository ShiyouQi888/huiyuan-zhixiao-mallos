<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money } from '../api';
import { useFeaturesStore } from '../stores/features';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import StatCard from '../components/StatCard.vue';
import ListRow from '../components/ListRow.vue';
import ProgressBar from '../components/ProgressBar.vue';
import ThemeToggle from '../components/ThemeToggle.vue';
import {
  ArrowUpRight, Award, Check, Coins, Crown, Handshake, LockKeyhole,
  SlidersHorizontal, TrendingUp, UserPlus, Users,
} from 'lucide-vue-next';

const router = useRouter();
const features = useFeaturesStore();
const rank = ref<any>(null);
const bonus = ref<any>(null);
const team = ref<any[]>([]);
const tree = ref<any>(null);

onMounted(async () => {
  const [r, b, t, tr] = await Promise.all([
    (features.has('rank.view') || features.has('rank.dividend')) ? api<any>('/me/rank').catch(() => null) : Promise.resolve(null),
    features.has('bonus.detail') ? api<any>('/me/bonus').catch(() => null) : Promise.resolve(null),
    features.has('team.view') ? api<any[]>('/me/team').catch(() => []) : Promise.resolve([]),
    features.has('team.view') ? api<any>('/me/team/tree?depth=3').catch(() => null) : Promise.resolve(null),
  ]);
  rank.value = r; bonus.value = b; team.value = t; tree.value = tr;
});

function countNodes(n: any): number {
  if (!n) return 0;
  return 1 + (n.children ?? []).reduce((s: number, c: any) => s + countNodes(c), 0);
}

const teamCount = computed(() => Math.max(0, countNodes(tree.value) - 1));
const isTopRank = computed(() => Boolean(rank.value) && rank.value.nextRank === null);
const rankProgress = computed(() => {
  const current = rank.value;
  if (!current?.nextRank?.threshold) return 0;
  return Math.min(100, (Number(current.totalPerformance ?? 0) / Number(current.nextRank.threshold)) * 100);
});

const INCOME_META: Record<number, { label: string; icon: any; tone: string }> = {
  1: { label: '直推奖', icon: UserPlus, tone: 'brand' },
  2: { label: '团队奖', icon: Users, tone: 'info' },
  3: { label: '平级奖', icon: Handshake, tone: 'gold' },
  4: { label: '领导奖', icon: Award, tone: 'green' },
  5: { label: '分红池', icon: Coins, tone: 'gold' },
  6: { label: '手工调整', icon: SlidersHorizontal, tone: 'neutral' },
};
const incomeRows = computed<any[]>(() => bonus.value?.byType ?? []);

const entries = computed(() => {
  const list: Array<{ to: string; label: string; hint: string; icon: any; tone: string }> = [];
  if (features.has('team.view')) {
    list.push({ to: '/team', label: '我的团队', hint: `直属 ${team.value.length} 人`, icon: Users, tone: 'brand' });
  }
  if (features.has('bonus.detail')) {
    list.push({ to: '/income', label: '收益明细', hint: '五条收益线', icon: TrendingUp, tone: 'green' });
  }
  if (features.has('rank.view')) {
    list.push({ to: '/level', label: '等级晋升', hint: `当前 Lv.${rank.value?.rankLevel ?? 0}`, icon: Award, tone: 'brand' });
  }
  if (features.has('rank.dividend')) {
    list.push({ to: '/dividend', label: '分红池', hint: `分配比例 ${((Number(rank.value?.poolRate ?? 0)) * 100).toFixed(0)}%`, icon: Coins, tone: 'gold' });
  }
  return list;
});
</script>

<template>
  <main class="page page--partner">
    <PageHeading eyebrow="合伙人中心" title="经营总览" subtitle="等级、团队、收益与分红，一屏掌握">
      <template #actions>
        <ThemeToggle />
      </template>
    </PageHeading>

    <!-- 等级概览 -->
    <section v-if="features.has('rank.view')" class="card card--hero rank-hero">
      <div class="rank-hero-head">
        <div class="rank-identity">
          <span class="rank-eyebrow">当前职级</span>
          <strong class="rank-name">{{ rank?.rankName ?? '—' }}</strong>
          <span class="rank-sub">Lv.{{ rank?.rankLevel ?? 0 }}</span>
        </div>
        <span class="rank-badge"><Crown :size="23" aria-hidden="true" /></span>
      </div>

      <div class="rank-metrics" :class="{ 'rank-metrics--single': !features.has('rank.dividend') }">
        <div class="rank-metric rank-metric--brand">
          <span>团队奖费率</span>
          <strong>{{ (Number(rank?.teamRate ?? 0) * 100).toFixed(0) }}%</strong>
        </div>
        <div v-if="features.has('rank.dividend')" class="rank-metric rank-metric--green">
          <span>分红池比例</span>
          <strong>{{ (Number(rank?.poolRate ?? 0) * 100).toFixed(0) }}%</strong>
        </div>
      </div>

      <div class="rank-performance">
        <span>团队累计业绩</span>
        <strong>¥{{ money(rank?.totalPerformance) }}</strong>
      </div>

      <ProgressBar
        v-if="rank?.nextRank"
        class="rank-progress"
        :value="rankProgress"
        :label="`距 ${rank.nextRank.name}`"
        :hint="`还差 ¥${money(rank.nextRank.gap)}`"
      />
      <div v-else-if="isTopRank" class="rank-state rank-state--complete">
        <Check :size="14" aria-hidden="true" />已达到最高职级
      </div>
    </section>

    <!-- 核心指标 -->
    <div
      v-if="features.has('team.view') || features.has('bonus.detail')"
      class="stat-grid"
    >
      <StatCard
        v-if="features.has('team.view')"
        label="团队总人数"
        :value="teamCount"
        :hint="`直属 ${team.length} 人 · 含全部层级`"
        tone="brand"
        clickable
        @click="router.push('/team')"
      />
      <StatCard
        v-if="features.has('bonus.detail')"
        label="累计收益"
        :value="`¥${money(bonus?.total)}`"
        hint="五条收益线合计"
        tone="green"
        clickable
        @click="router.push('/income')"
      />
    </div>

    <!-- 经营入口 -->
    <template v-if="entries.length">
      <SectionHeading title="经营入口" subtitle="团队、收益与分红的常用视图" />
      <nav class="entry-grid" aria-label="经营入口">
        <router-link v-for="entry in entries" :key="entry.to" :to="entry.to" class="entry-card">
          <span class="entry-icon" :class="entry.tone === 'brand' ? '' : `entry-icon--${entry.tone}`">
            <component :is="entry.icon" :size="20" :stroke-width="1.8" aria-hidden="true" />
          </span>
          <span class="entry-copy">
            <span class="entry-label">{{ entry.label }}</span>
            <span class="entry-hint">{{ entry.hint }}</span>
          </span>
          <ArrowUpRight class="entry-chevron" :size="15" aria-hidden="true" />
        </router-link>
      </nav>
    </template>

    <!-- 收益构成 -->
    <template v-if="features.has('bonus.detail')">
      <SectionHeading title="收益构成" subtitle="按收益类型累计，每日结算" />
      <div class="card card--list">
        <ListRow
          v-for="row in incomeRows"
          :key="row.type"
          :title="INCOME_META[row.type]?.label ?? '收益'"
          :value="`¥${money(row.amount)}`"
          value-tone="brand"
        >
          <template #icon>
            <span class="list-row-icon" :class="`list-row-icon--${INCOME_META[row.type]?.tone ?? 'brand'}`">
              <component :is="INCOME_META[row.type]?.icon ?? TrendingUp" :size="15" aria-hidden="true" />
            </span>
          </template>
        </ListRow>
        <p v-if="!incomeRows.length" class="inline-empty">暂无收益记录</p>
      </div>
    </template>

    <!-- 平级奖锁定提示 -->
    <div v-if="rank?.peerBonusLocked" class="alert-card alert-card--success">
      <span class="alert-card-icon"><LockKeyhole :size="16" aria-hidden="true" /></span>
      <div>
        <div class="alert-card-title">平级奖已永久锁定</div>
        <div class="alert-card-text">双方后续升级不影响已锁定资格的发放</div>
      </div>
    </div>
  </main>
</template>
