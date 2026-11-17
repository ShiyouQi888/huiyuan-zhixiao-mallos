<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money } from '../api';
import { useUserStore } from '../stores/user';
import { Award, ChevronRight, Coins, Gift, Link2, ShoppingBag } from 'lucide-vue-next';

const store = useUserStore();
const router = useRouter();
const rank = ref<any>(null);
const bonus = ref<any>(null);
const packages = ref<any[]>([]);

onMounted(async () => {
  await store.loadProfile().catch(() => {});
  const [r, b, p] = await Promise.all([
    api<any>('/me/rank').catch(() => null),
    api<any>('/me/bonus').catch(() => null),
    api<any[]>('/packages').catch(() => []),
  ]);
  rank.value = r; bonus.value = b; packages.value = p;
});
</script>

<template>
  <div class="page">
    <!-- Hero -->
    <div class="card hero" style="padding:22px">
      <div class="row between">
        <div>
          <div class="subtitle" style="color:var(--accent)">{{ store.profile?.nickname ?? '会员' }}</div>
          <div style="font-size:20px;font-weight:650;margin-top:6px">{{ rank?.rankName ?? '普通会员' }}</div>
        </div>
        <div class="icon-tile" style="width:52px;height:52px;border-radius:16px"><Award :size="22" aria-hidden="true" /></div>
      </div>
      <div class="divider" style="margin:20px 0"/>
      <div class="row between">
        <div>
          <div class="subtitle">团队累计业绩</div>
          <div style="font-size:22px;font-weight:650;margin-top:6px">¥{{ money(rank?.totalPerformance) }}</div>
        </div>
        <div style="text-align:right">
          <div class="subtitle">团队奖费率</div>
          <div class="accent" style="font-size:22px;font-weight:650;margin-top:6px">{{ ((rank?.teamRate ?? 0) * 100).toFixed(0) }}%</div>
        </div>
      </div>
      <div v-if="rank?.nextRank" style="margin-top:18px">
        <div class="row between subtitle" style="font-size:11px">
          <span>距 {{ rank.nextRank.name }}</span>
          <span>还差 ¥{{ money(rank.nextRank.gap) }}</span>
        </div>
        <div class="progress-track" style="height:5px;border-radius:5px;margin-top:8px;overflow:hidden">
          <div style="height:100%;border-radius:5px;background:linear-gradient(90deg,#6366f1,#a78bfa)"
            :style="{width: Math.min(100, (rank.totalPerformance / rank.nextRank.threshold) * 100) + '%'}"/>
        </div>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div class="grid-3" style="margin-top:16px">
      <t-button theme="default" variant="text" block class="card" style="text-align:center" @click="router.push('/assets')">
        <Coins :size="22" class="accent" aria-hidden="true" />
        <div style="font-size:12px;margin-top:8px">我的资产</div>
      </t-button>
      <t-button theme="default" variant="text" block class="card" style="text-align:center" @click="router.push('/referral')">
        <Link2 :size="22" class="accent" aria-hidden="true" />
        <div style="font-size:12px;margin-top:8px">推广中心</div>
      </t-button>
      <t-button theme="default" variant="text" block class="card" style="text-align:center" @click="router.push('/packages')">
        <Gift :size="22" class="accent" aria-hidden="true" />
        <div style="font-size:12px;margin-top:8px">礼包购买</div>
      </t-button>
    </div>

    <!-- 收益概览 -->
    <div class="card" style="margin-top:16px">
      <div class="row between" style="margin-bottom:16px">
        <div class="section-title">累计收益</div>
        <t-button theme="default" variant="text" size="small" class="accent" @click="router.push('/bonus')">明细 <ChevronRight :size="14" aria-hidden="true" /></t-button>
      </div>
      <div style="font-size:28px;font-weight:650">¥{{ money(bonus?.total) }}</div>
      <div class="grid-2" style="margin-top:18px">
        <div v-for="item in bonus?.byType?.slice(0, 4) ?? []" :key="item.type" class="subtitle" style="font-size:12px">
          {{ ['直推奖','团队奖','平级奖','领导奖'][item.type - 1] }} · ¥{{ money(item.amount) }}
        </div>
      </div>
    </div>

    <!-- 商城入口 -->
    <router-link to="/products" class="card row between" style="margin-top:16px;padding:16px 18px;text-decoration:none;color:inherit">
      <div class="row gap-12">
        <div class="icon-tile icon-tile--green" style="width:40px;height:40px"><ShoppingBag :size="19" aria-hidden="true" /></div>
        <div>
          <div style="font-size:13px;font-weight:600">商品商城</div>
          <div class="subtitle" style="font-size:11px;margin-top:3px">会员专属价 · 权益值可抵扣</div>
        </div>
      </div>
      <ChevronRight :size="18" class="muted" aria-hidden="true" />
    </router-link>

    <!-- 礼包推荐 -->
    <div class="section-title" style="margin:22px 0 12px">会员礼包</div>
    <div v-for="p in packages" :key="p.id" class="card row between" style="padding:15px 18px">
      <div>
        <div style="font-weight:600">{{ p.name }}</div>
        <div class="subtitle" style="font-size:11px;margin-top:4px">权益值 ¥{{ money(p.equityValue) }} · 12个月有效</div>
      </div>
      <div style="text-align:right">
        <div class="accent" style="font-weight:650">¥{{ money(p.price) }}</div>
        <router-link to="/packages" class="subtitle row gap-8" style="font-size:11px">去购买 <ChevronRight :size="14" aria-hidden="true" /></router-link>
      </div>
    </div>
  </div>
</template>
