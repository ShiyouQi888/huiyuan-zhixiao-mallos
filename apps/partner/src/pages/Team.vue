<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';

const direct = ref<any[]>([]);
const tree = ref<any>(null);
const loading = ref(true);

onMounted(async () => {
  const [d, t] = await Promise.all([
    api<any[]>('/me/team').catch(() => []),
    api<any>('/me/team/tree?depth=5').catch(() => null),
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
    <div class="subtitle">伞下全部层级，业绩每日自动归集</div>

    <div class="grid-3" style="margin-top:18px">
      <div class="card" style="text-align:center;padding:16px 6px"><div style="font-size:20px;font-weight:650">{{ direct.length }}</div><div class="subtitle" style="font-size:10px">直属</div></div>
      <div class="card" style="text-align:center;padding:16px 6px"><div class="gold" style="font-size:20px;font-weight:650">{{ Math.max(0, countNodes(tree)-1) }}</div><div class="subtitle" style="font-size:10px">团队总数</div></div>
      <div class="card" style="text-align:center;padding:16px 6px"><div style="font-size:20px;font-weight:650">{{ tree?.children?.length ?? 0 }}</div><div class="subtitle" style="font-size:10px">伞下分支</div></div>
    </div>

    <div class="section-title" style="margin:22px 0 10px">直属下级</div>
    <div class="card" style="padding:4px 18px">
      <div v-if="loading" class="subtitle" style="padding:20px 0;text-align:center">加载中…</div>
      <div v-else-if="direct.length === 0" class="subtitle" style="padding:24px 0;text-align:center">暂无直属下级</div>
      <div v-for="m in direct" :key="m.id" class="list-row row between">
        <div class="row gap-12">
          <div style="width:36px;height:36px;border-radius:11px;background:var(--surface-2);display:flex;align-items:center;justify-content:center">{{ (m.nickname ?? '会')[0] }}</div>
          <div><div style="font-size:13px">{{ m.nickname ?? '会员' }}</div><div class="subtitle" style="font-size:10px;margin-top:3px">{{ m.phone }}</div></div>
        </div>
        <div style="text-align:right"><div class="tag">Lv.{{ m.rankLevel }}</div><div class="subtitle" style="font-size:10px;margin-top:4px">{{ m.equityStatus === 1 ? '暂停计酬' : '正常' }}</div></div>
      </div>
    </div>

    <div class="section-title" style="margin:22px 0 10px">团队结构</div>
    <div class="card" style="padding:18px">
      <template v-if="tree">
        <div class="row gap-8"><span class="tag">{{ tree.nickname ?? '我' }}</span><span class="subtitle" style="font-size:10px">Lv.{{ tree.rankLevel }}</span></div>
        <div v-for="c in tree.children ?? []" :key="c.id" style="padding-left:16px;border-left:1px solid var(--line);margin-left:6px;margin-top:8px">
          <div class="row gap-8" style="padding:4px 0"><span class="muted">└</span><span style="font-size:12px">{{ c.nickname }}</span><span class="subtitle" style="font-size:10px">Lv.{{ c.rankLevel }} · {{ c.children?.length ?? 0 }} 分支</span></div>
          <div v-for="g in c.children ?? []" :key="g.id" style="padding-left:14px;border-left:1px solid var(--line);margin-left:4px">
            <div class="row gap-8" style="padding:3px 0;font-size:11px"><span class="muted">└</span><span>{{ g.nickname }}</span><span class="subtitle" style="font-size:9px">Lv.{{ g.rankLevel }}</span></div>
          </div>
        </div>
        <div v-if="!tree.children?.length" class="subtitle" style="font-size:12px">暂无下级</div>
      </template>
    </div>
  </div>
</template>
