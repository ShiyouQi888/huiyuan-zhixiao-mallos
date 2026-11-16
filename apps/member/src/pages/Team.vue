<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';

const direct = ref<any[]>([]);
const tree = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
  const [d, t] = await Promise.all([
    api<any[]>('/me/team').catch(() => []),
    api<any>('/me/team/tree?depth=4').catch(() => null),
  ]);
  direct.value = d; tree.value = t; loading.value = false;
});

function countNodes(n: any): number {
  if (!n) return 0;
  return 1 + (n.children ?? []).reduce((s: number, c: any) => s + countNodes(c), 0);
}
</script>

<template>
  <div class="page">
    <div class="title">我的团队</div>
    <div class="subtitle">团队业绩每日归集，自动向上累加</div>

    <div class="grid-2" style="margin-top:18px">
      <div class="card">
        <div class="subtitle">直属下级</div>
        <div style="font-size:26px;font-weight:650;margin-top:8px">{{ direct.length }}</div>
      </div>
      <div class="card">
        <div class="subtitle">团队总人数</div>
        <div style="font-size:26px;font-weight:650;margin-top:8px accent">{{ Math.max(0, countNodes(tree) - 1) }}</div>
      </div>
    </div>

    <div class="section-title" style="margin:22px 0 12px">直属下级</div>
    <div class="card" style="padding:6px 18px">
      <div v-if="loading" class="subtitle" style="padding:20px 0">加载中…</div>
      <div v-else-if="direct.length === 0" class="subtitle" style="padding:24px 0;text-align:center">暂无直属下级</div>
      <div v-for="m in direct" :key="m.id" class="list-row row between">
        <div class="row gap-12">
          <div style="width:36px;height:36px;border-radius:11px;background:var(--surface-2);display:flex;align-items:center;justify-content:center">
            {{ (m.nickname ?? '会')[0] }}
          </div>
          <div>
            <div style="font-size:13px">{{ m.nickname ?? '会员' }}</div>
            <div class="subtitle" style="font-size:11px;margin-top:3px">{{ m.phone }}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="tag">Lv.{{ m.rankLevel }}</div>
          <div class="subtitle" style="font-size:10px;margin-top:5px">{{ m.equityStatus === 1 ? '暂停计酬' : '正常计酬' }}</div>
        </div>
      </div>
    </div>

    <div class="section-title" style="margin:22px 0 12px">团队结构（4 层内）</div>
    <div class="card" style="padding:18px">
      <div v-if="tree" class="col gap-8">
        <div class="row gap-8">
          <span class="tag">{{ tree.nickname ?? '我' }}</span>
          <span class="subtitle" style="font-size:11px">Lv.{{ tree.rankLevel }}</span>
        </div>
        <div v-for="(c, i) in tree.children ?? []" :key="c.id" style="padding-left:18px;border-left:1px solid var(--line);margin-left:6px">
          <div class="row gap-8" style="padding:4px 0">
            <span style="color:var(--muted)">└</span>
            <span style="font-size:12px">{{ c.nickname }}</span>
            <span class="subtitle" style="font-size:10px">Lv.{{ c.rankLevel }} · {{ c.children?.length ?? 0 }} 人</span>
          </div>
        </div>
        <div v-if="!tree.children?.length" class="subtitle" style="font-size:12px">暂无下级</div>
      </div>
    </div>
  </div>
</template>
