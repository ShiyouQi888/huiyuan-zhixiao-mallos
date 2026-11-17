<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import StatCard from '../components/StatCard.vue';
import ListRow from '../components/ListRow.vue';
import StatusTag from '../components/StatusTag.vue';
import EmptyState from '../components/EmptyState.vue';
import { Network, UsersRound } from 'lucide-vue-next';

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

function initial(value: unknown): string {
  return String(value ?? '会').slice(0, 1) || '会';
}
</script>

<template>
  <main class="page page--partner">
    <PageHeading
      eyebrow="组织架构"
      title="我的团队"
      subtitle="伞下全部层级，业绩每日自动归集"
    />

    <div class="stat-grid stat-grid--3">
      <StatCard label="直属下级" :value="direct.length" tone="brand" />
      <StatCard label="团队总数" :value="Math.max(0, countNodes(tree) - 1)" tone="green" />
      <StatCard label="伞下分支" :value="tree?.children?.length ?? 0" />
    </div>

    <SectionHeading title="直属下级" :subtitle="`共 ${direct.length} 人，按最新加入排序`" />
    <div v-if="loading" class="card card--list">
      <div class="skeleton-block" style="height: 14px; margin: 16px 0" />
      <div class="skeleton-block" style="height: 14px; margin: 16px 0" />
      <div class="skeleton-block" style="height: 14px; margin: 16px 0" />
    </div>
    <div v-else-if="direct.length" class="card card--list">
      <ListRow
        v-for="m in direct"
        :key="m.id"
        :title="m.nickname ?? '会员'"
        :subtitle="m.phone"
      >
        <template #icon>
          <span class="avatar">{{ initial(m.nickname) }}</span>
        </template>
        <template #trailing>
          <StatusTag tone="brand">Lv.{{ m.rankLevel }}</StatusTag>
          <StatusTag :tone="m.transferQuotaStatus === 1 ? 'warning' : 'green'">
            {{ m.transferQuotaStatus === 1 ? '权益通已用完' : '权益通可用' }}
          </StatusTag>
        </template>
      </ListRow>
    </div>
    <EmptyState
      v-else
      title="暂无直属下级"
      description="邀请会员加入后，团队成员与业绩会出现在这里"
      :icon="UsersRound"
    />

    <SectionHeading title="团队结构" subtitle="展示伞下前三层分支关系" />
    <div class="card">
      <template v-if="tree">
        <div class="tree">
          <div class="tree-node tree-node--root">
            <span class="tree-avatar">我</span>
            <span class="tree-name">{{ tree.nickname ?? '我' }}</span>
            <StatusTag tone="brand">Lv.{{ tree.rankLevel }}</StatusTag>
            <StatusTag class="tree-level" tone="neutral">{{ tree.children?.length ?? 0 }} 分支</StatusTag>
          </div>

          <div v-for="child in tree.children ?? []" :key="child.id" class="tree-branch">
            <div class="tree-node">
              <span class="tree-avatar">{{ initial(child.nickname) }}</span>
              <span class="tree-name">{{ child.nickname }}</span>
              <StatusTag tone="neutral">Lv.{{ child.rankLevel }}</StatusTag>
              <span class="tree-meta">{{ child.children?.length ?? 0 }} 分支</span>
            </div>
            <div v-for="grand in child.children ?? []" :key="grand.id" class="tree-grandchild">
              <span class="tree-dot" />
              <span class="tree-name">{{ grand.nickname }}</span>
              <span class="tree-meta">Lv.{{ grand.rankLevel }}</span>
            </div>
          </div>

          <p v-if="!tree.children?.length" class="tree-empty">暂无下级成员</p>
        </div>
      </template>
      <EmptyState
        v-else
        title="团队结构暂不可用"
        description="稍后刷新页面，或确认团队数据权限是否已开通"
        :icon="Network"
      />
    </div>
  </main>
</template>
