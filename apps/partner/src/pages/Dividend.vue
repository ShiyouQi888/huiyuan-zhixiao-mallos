<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money } from '../api';

const router = useRouter();
const records = ref<any[]>([]);
const rank = ref<any>(null);

onMounted(async () => {
  const [r, b] = await Promise.all([
    api<any>('/me/rank').catch(() => null),
    api<any>('/me/bonus/records?type=5').catch(() => null),
  ]);
  rank.value = r; records.value = b?.list ?? [];
});
</script>

<template>
  <div class="page">
    <div class="row gap-8" style="margin-bottom:16px">
      <button class="icon-btn" @click="router.back()">‹</button><div class="title" style="font-size:18px">分红池</div>
    </div>

    <div class="card hero" style="padding:20px">
      <div class="subtitle">当前职级分红比例</div>
      <div class="gold" style="font-size:28px;font-weight:650;margin-top:8px">{{ ((rank?.poolRate??0)*100).toFixed(0) }}%</div>
      <div class="subtitle" style="font-size:11px;margin-top:12px;line-height:1.7">
        池子 = 全网当日业绩 × 该级比例，在该等级人数间平均分配。等级恰好等于该级才可参与，人数为 0 时不分配。
      </div>
    </div>

    <div class="section-title" style="margin:22px 0 10px">分红记录</div>
    <div class="card" style="padding:4px 18px">
      <div v-if="records.length === 0" class="subtitle" style="padding:24px 0;text-align:center">暂无分红记录</div>
      <div v-for="r in records" :key="r.id" class="list-row row between">
        <div><div style="font-size:13px">全网分红池</div><div class="subtitle" style="font-size:11px;margin-top:4px">{{ String(r.settleDate).slice(0,10) }}</div></div>
        <div class="green" style="font-size:15px;font-weight:650">+¥{{ money(r.amount) }}</div>
      </div>
    </div>
  </div>
</template>
