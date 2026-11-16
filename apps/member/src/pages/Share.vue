<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, money } from '../api';
import { useUserStore } from '../stores/user';
import { share, platform } from '../adapter';
import { Toast } from './_toast';
import PageHeading from '../components/PageHeading.vue';
import SectionHeading from '../components/SectionHeading.vue';
import EmptyState from '../components/EmptyState.vue';
import { BadgePercent, Clock3, Copy, Share2, UsersRound } from 'lucide-vue-next';

const store = useUserStore();
const info = ref<any>(null);
const invites = ref<any[]>([]);
const stats = ref<any>(null);
const inviteCode = computed(() => info.value?.inviteCode ?? store.profile?.inviteCode ?? '');

onMounted(async () => {
  await store.loadProfile().catch(() => {});
  const [referral, team, bonus] = await Promise.all([
    store.has('referral.center') ? api<any>('/referral/qrcode').catch(() => null) : Promise.resolve(null),
    store.has('team.view') ? api<any[]>('/me/team').catch(() => []) : Promise.resolve([]),
    store.has('bonus.detail') ? api<any>('/me/bonus').catch(() => null) : Promise.resolve(null),
  ]);
  info.value = referral;
  invites.value = team;
  stats.value = bonus;
});

async function copyLink() {
  try {
    if (!info.value?.url) throw new Error('推广链接暂不可用');
    await share('加入太阳线会员', info.value.url);
    Toast(platform === 'h5' ? '推广链接已复制' : '已打开系统分享', 'success');
  } catch (e: any) { Toast(e.message ?? '复制失败，请稍后重试', 'danger'); }
}

async function copyInviteCode() {
  try {
    if (!inviteCode.value) throw new Error('邀请码暂不可用');
    await share('太阳线会员邀请码', inviteCode.value);
    Toast(platform === 'h5' ? '邀请码已复制' : '请通过系统分享', 'success');
  } catch (e: any) { Toast(e.message ?? '复制失败，请稍后重试', 'danger'); }
}
</script>

<template>
  <main class="page">
    <PageHeading eyebrow="邀请中心" title="邀请好友" subtitle="分享专属链接，好友注册后可与您建立推荐关系" />

    <!-- 邀请卡 -->
    <div class="invite-card">
      <div class="invite-card-head"><span class="invite-icon"><Share2 :size="19" aria-hidden="true" /></span><span>专属邀请</span></div>
      <div class="invite-label">我的邀请码</div>
      <div class="invite-code">{{ inviteCode || '加载中' }}</div>
      <button type="button" class="invite-copy-code" :disabled="!inviteCode" @click="copyInviteCode"><Copy :size="14" aria-hidden="true" />复制邀请码</button>
      <div class="invite-url">{{ info?.url || '推广链接加载中…' }}</div>
      <button type="button" class="invite-share-button" :disabled="!info?.url" @click="copyLink">复制推广链接</button>
    </div>

    <!-- 数据 -->
    <div class="share-stats">
      <div class="share-stat">
        <UsersRound :size="17" aria-hidden="true" />
        <div><strong>{{ invites.length }}</strong><span>已邀请会员</span></div>
      </div>
      <div class="share-stat share-stat--green">
        <BadgePercent :size="17" aria-hidden="true" />
        <div><strong>¥{{ money(stats?.byType?.find((b:any)=>b.type===1)?.amount) }}</strong><span>直推累计</span></div>
      </div>
      <div class="share-stat share-stat--amber">
        <Clock3 :size="17" aria-hidden="true" />
        <div><strong>分期释放</strong><span>奖励结算周期</span></div>
      </div>
    </div>

    <!-- 邀请记录 -->
    <SectionHeading title="邀请记录" subtitle="已绑定到您名下的会员" />
    <div v-if="invites.length" class="invite-list">
      <div v-for="m in invites" :key="m.id" class="list-row row between">
        <div class="row gap-8">
          <div class="invite-avatar">{{ String(m.nickname ?? '会员').slice(0, 1) }}</div>
          <div>
            <div style="font-size:12px">{{ m.nickname ?? '会员' }}</div>
            <div class="subtitle" style="font-size:10px;margin-top:2px">{{ new Date(m.createdAt).toLocaleDateString('zh-CN') }}</div>
          </div>
        </div>
        <div class="green" style="font-size:12px">已绑定</div>
      </div>
    </div>
    <EmptyState v-else title="还没有邀请记录" description="分享您的专属链接，好友注册后会显示在这里" />
  </main>
</template>

<style scoped>
.invite-card {
  position: relative;
  overflow: hidden;
  padding: 20px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 96% -16%, rgba(255, 255, 255, 0.26), transparent 46%),
    linear-gradient(120deg, #ff8a4c 0%, #f45a1f 54%, #e3410c 100%);
  color: #fff;
  text-align: center;
  box-shadow: 0 12px 28px rgba(224, 66, 12, 0.22);
}
.invite-card::after {
  position: absolute;
  right: -36px;
  bottom: -78px;
  width: 150px;
  height: 150px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  content: '';
  pointer-events: none;
}
.invite-card-head { position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; gap: 8px; color: rgba(255, 255, 255, .82); font-size: 10.5px; font-weight: 650; }
.invite-icon { display: inline-flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 11px; background: rgba(255, 255, 255, .18); color: #fff; }
.invite-label { position: relative; z-index: 1; margin-top: 17px; color: rgba(255, 255, 255, .74); font-size: 10px; }
.invite-code { position: relative; z-index: 1; margin-top: 5px; color: #fff; font-family: var(--font-num); font-size: 28px; font-weight: 800; letter-spacing: .14em; }
.invite-copy-code { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; padding: 5px 9px; border: 1px solid rgba(255, 255, 255, .22); border-radius: 999px; background: rgba(255, 255, 255, .14); color: #fff; font: inherit; font-size: 9.5px; cursor: pointer; }
.invite-copy-code:disabled { opacity: .55; cursor: default; }
.invite-url { position: relative; z-index: 1; overflow: hidden; margin-top: 15px; padding: 11px; border: 1px solid rgba(255, 255, 255, .18); border-radius: 10px; background: rgba(255, 255, 255, .12); color: rgba(255, 255, 255, .8); font-size: 9.5px; text-overflow: ellipsis; white-space: nowrap; }
.invite-share-button { position: relative; z-index: 1; display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; margin-top: 12px; border: 0; border-radius: 12px; background: #fff; color: #e8460d; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: transform .14s ease, opacity .14s ease; }
.invite-share-button:active { transform: scale(.985); }
.invite-share-button:disabled { opacity: .55; cursor: not-allowed; }
.share-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 13px; }
.share-stat { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 12px 9px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface); color: var(--brand); box-shadow: var(--shadow-card); }
.share-stat--green { color: var(--green); }
.share-stat--amber { color: var(--amber); }
.share-stat > div { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.share-stat strong { overflow: hidden; color: var(--text); font-family: var(--font-num); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.share-stat span { color: var(--muted); font-size: 10px; white-space: nowrap; }
.invite-list { padding: 2px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); box-shadow: var(--shadow-card); }
.invite-avatar { display: flex; width: 36px; height: 36px; align-items: center; justify-content: center; border-radius: 11px; background: var(--brand-soft); color: var(--brand); font-size: 12px; font-weight: 700; }
@media (max-width: 360px) { .share-stat { flex-direction: column; align-items: flex-start; } }
</style>
