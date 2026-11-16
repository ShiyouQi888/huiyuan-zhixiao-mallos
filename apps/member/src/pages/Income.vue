<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money } from '../api';
import { ChevronRight, WalletCards } from 'lucide-vue-next';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import EmptyState from '../components/EmptyState.vue';

const router = useRouter();
const summary = ref<any>(null);
const records = ref<any[]>([]);
const plans = ref<any>(null);

onMounted(async () => {
  summary.value = await api<any>('/me/bonus').catch(() => null);
  records.value = (await api<any>('/me/bonus/records').catch(() => null))?.list ?? [];
  // 直推奖计划明细从收益记录派生，不需要单独接口
  plans.value = summary.value?.byType?.find((b: any) => b.type === 1);
});

const NAMES: Record<number, string> = { 1: '直推奖励', 2: '团队奖励', 3: '平级奖励', 4: '领导奖励', 5: '分红池', 6: '手工调整' };
</script>

<template>
  <main class="page">
    <PageHeading eyebrow="收益中心" title="我的收益" subtitle="查看累计奖金、奖励构成与结算记录" />

    <section class="income-hero">
      <div class="income-hero-head">
        <span>累计收益</span>
        <button type="button" class="income-asset-link" @click="router.push('/assets')">资产中心 <ChevronRight :size="13" aria-hidden="true" /></button>
      </div>
      <div class="income-total"><small>¥</small>{{ money(summary?.total) }}</div>
      <div class="income-split">
        <div><span>直推奖励</span><strong>¥{{ money(plans?.amount) }}</strong></div>
        <div><span>奖励合计</span><strong>¥{{ money(summary?.byType?.reduce((s:number,b:any)=>s+Number(b.amount),0)) }}</strong></div>
      </div>
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
    <SectionHeading title="收益明细" subtitle="按结算日期查看奖金发放情况" />
    <div v-if="records.length" class="income-record-list">
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

    <div class="subtitle" style="text-align:center;margin-top:20px;font-size:11px">团队、平级、领导奖与分红池请在合伙人中心查看</div>
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
.income-assets-row { padding: 15px 16px; cursor: pointer; }
.income-assets-icon { display: inline-flex; width: 38px; height: 38px; align-items: center; justify-content: center; border-radius: 12px; background: var(--brand-soft); color: var(--brand); }
.income-record-list { padding: 3px 14px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); box-shadow: var(--shadow-card); }
</style>
