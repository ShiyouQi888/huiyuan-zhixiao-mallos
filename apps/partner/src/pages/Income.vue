<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api, money } from '../api';

const summary = ref<any>(null);
const records = ref<any[]>([]);
const type = ref('');
const TYPES = [
  { v: '', l: '全部' }, { v: '1', l: '直推' }, { v: '2', l: '团队' },
  { v: '3', l: '平级' }, { v: '4', l: '领导' }, { v: '5', l: '分红' }, { v: '6', l: '调整' },
];
const NAMES: Record<number, string> = { 1:'直推奖',2:'团队奖',3:'平级奖',4:'领导奖',5:'分红池',6:'手工调整' };

async function load() {
  summary.value = await api<any>('/me/bonus').catch(() => null);
  records.value = (await api<any>(`/me/bonus/records${type.value ? `?type=${type.value}` : ''}`).catch(() => null))?.list ?? [];
}
onMounted(load);
</script>

<template>
  <div class="page">
    <div class="title">我的收益</div>
    <div class="subtitle">五条收益线，每日结算，70% 钱包 + 30% 数权</div>

    <div class="card hero" style="margin-top:18px;padding:22px">
      <div class="subtitle">累计收益</div>
      <div class="gold" style="font-size:32px;font-weight:650;margin-top:8px">¥{{ money(summary?.total) }}</div>
      <div class="grid-2" style="margin-top:20px">
        <div v-for="b in summary?.byType ?? []" :key="b.type">
          <div class="subtitle" style="font-size:11px">{{ NAMES[b.type] }}</div>
          <div style="font-size:15px;font-weight:600;margin-top:4px">¥{{ money(b.amount) }}</div>
        </div>
      </div>
    </div>

    <div class="row" style="gap:8px;overflow-x:auto;margin:20px 0 12px;padding-bottom:4px">
      <button v-for="t in TYPES" :key="t.v" class="btn" :class="type === t.v ? 'btn-primary' : 'btn-ghost'"
        style="padding:8px 14px;font-size:12px;white-space:nowrap" @click="type=t.v; load()">{{ t.l }}</button>
    </div>

    <div class="card" style="padding:4px 18px">
      <div v-if="records.length === 0" class="subtitle" style="padding:24px 0;text-align:center">暂无记录</div>
      <div v-for="r in records" :key="r.id" class="list-row row between">
        <div><div style="font-size:13px">{{ NAMES[r.type] }}</div><div class="subtitle" style="font-size:11px;margin-top:4px">{{ String(r.settleDate).slice(0,10) }}</div></div>
        <div style="text-align:right"><div class="green" style="font-size:15px;font-weight:650">+¥{{ money(r.amount) }}</div><div class="subtitle" style="font-size:10px;margin-top:3px">现金 {{ money(r.cashAmount) }} · 数权 {{ money(r.tokenAmount) }}</div></div>
      </div>
    </div>
  </div>
</template>
