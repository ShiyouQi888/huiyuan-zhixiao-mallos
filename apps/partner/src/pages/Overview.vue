<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money } from '../api';
import { Crown, LockKeyhole } from 'lucide-vue-next';

const router = useRouter();
const rank = ref<any>(null);
const bonus = ref<any>(null);
const team = ref<any[]>([]);
const tree = ref<any>(null);

onMounted(async () => {
  const [r, b, t, tr] = await Promise.all([
    api<any>('/me/rank').catch(() => null),
    api<any>('/me/bonus').catch(() => null),
    api<any[]>('/me/team').catch(() => []),
    api<any>('/me/team/tree?depth=3').catch(() => null),
  ]);
  rank.value = r; bonus.value = b; team.value = t; tree.value = tr;
});

function countNodes(n: any): number {
  if (!n) return 0;
  return 1 + (n.children ?? []).reduce((s: number, c: any) => s + countNodes(c), 0);
}
</script>

<template>
  <div class="page">
    <div class="row between">
      <div>
        <div class="subtitle gold">合伙人中心</div>
        <div class="title" style="margin-top:4px">经营总览</div>
      </div>
      <Crown :size="22" style="color:var(--gold)" aria-hidden="true" />
    </div>

    <!-- 等级卡 -->
    <div class="card hero" style="margin-top:18px;padding:22px">
      <div class="row between">
        <div>
          <div class="subtitle">当前职级</div>
          <div style="font-size:24px;font-weight:650;margin-top:6px" class="gold">{{ rank?.rankName ?? '—' }}</div>
        </div>
        <div style="text-align:right"><div class="subtitle">团队奖费率</div><div class="gold" style="font-size:24px;font-weight:650;margin-top:6px">{{ ((rank?.teamRate ?? 0)*100).toFixed(0) }}%</div></div>
      </div>
      <div style="height:1px;background:rgba(255,255,255,.08);margin:18px 0"/>
      <div class="row between">
        <div><div class="subtitle">团队累计业绩</div><div style="font-size:20px;font-weight:650;margin-top:6px">¥{{ money(rank?.totalPerformance) }}</div></div>
        <div style="text-align:right"><div class="subtitle">分红池比例</div><div class="green" style="font-size:20px;font-weight:650;margin-top:6px">{{ ((rank?.poolRate ?? 0)*100).toFixed(0) }}%</div></div>
      </div>
      <div v-if="rank?.nextRank" style="margin-top:18px">
        <div class="row between subtitle" style="font-size:11px"><span>距 {{ rank.nextRank.name }}</span><span>还差 ¥{{ money(rank.nextRank.gap) }}</span></div>
        <div style="height:5px;background:rgba(255,255,255,.08);border-radius:5px;margin-top:8px;overflow:hidden">
          <div style="height:100%;background:linear-gradient(90deg,#d4a759,#f0cd8a);border-radius:5px" :style="{width: Math.min(100, rank.totalPerformance/rank.nextRank.threshold*100)+'%'}"/>
        </div>
      </div>
    </div>

    <!-- 团队与收益 -->
    <div class="grid-2" style="margin-top:14px">
      <div class="card" @click="router.push('/team')" style="cursor:pointer">
        <div class="subtitle" style="font-size:11px">团队总人数</div>
        <div style="font-size:24px;font-weight:650;margin-top:8px">{{ Math.max(0, countNodes(tree)-1) }}</div>
        <div class="subtitle" style="font-size:10px;margin-top:4px">直属 {{ team.length }} 人 ›</div>
      </div>
      <div class="card" @click="router.push('/income')" style="cursor:pointer">
        <div class="subtitle" style="font-size:11px">累计收益</div>
        <div class="green" style="font-size:24px;font-weight:650;margin-top:8px">¥{{ money(bonus?.total) }}</div>
        <div class="subtitle" style="font-size:10px;margin-top:4px">五条收益线合计 ›</div>
      </div>
    </div>

    <!-- 收益线 -->
    <div class="section-title" style="margin:22px 0 10px">收益线构成</div>
    <div class="card" style="padding:6px 18px">
      <div v-for="b in bonus?.byType ?? []" :key="b.type" class="list-row row between">
        <div style="font-size:13px">{{ ['','直推奖','团队奖','平级奖','领导奖','分红池','手工调整'][b.type] }}</div>
        <div class="gold" style="font-size:14px;font-weight:600">¥{{ money(b.amount) }}</div>
      </div>
    </div>

    <div v-if="rank?.peerBonusLocked" class="card" style="margin-top:14px;border-color:rgba(74,222,128,.2)">
      <div class="row gap-8"><LockKeyhole :size="17" class="green" aria-hidden="true" /><div><div style="font-size:13px;font-weight:600" class="green">平级奖已永久锁定</div><div class="subtitle" style="font-size:11px">双方后续升级不影响发放</div></div></div>
    </div>
  </div>
</template>
