<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from '../api';
import { useUserStore } from '../stores/user';
import { share } from '../adapter';
import { Toast } from './_toast';

const store = useUserStore();
const info = ref<any>(null);
const team = ref<any[]>([]);

onMounted(async () => {
  info.value = await api<any>('/referral/qrcode').catch(() => null);
  team.value = await api<any[]>('/me/team').catch(() => []);
});

async function copy() {
  await share('加入太阳线会员', info.value?.url ?? '');
  Toast('推广链接已复制', 'success');
}
</script>

<template>
  <div class="page">
    <div class="title">推广中心</div>
    <div class="subtitle">分享您的邀请码，好友注册后自动绑定推荐关系</div>

    <div class="card hero" style="margin-top:18px;padding:24px;text-align:center">
      <div class="subtitle">我的邀请码</div>
      <div style="font-size:30px;font-weight:700;letter-spacing:.12em;margin:12px 0 accent">
        {{ info?.inviteCode ?? store.profile?.inviteCode ?? '——' }}
      </div>
      <div class="subtitle" style="font-size:11px">{{ info?.slogan }}</div>
      <div style="margin-top:20px;padding:12px;background:var(--surface-2);border-radius:10px;word-break:break-all;font-size:10px" class="muted">
        {{ info?.url }}
      </div>
      <t-button theme="primary" block style="margin-top:16px" @click="copy">复制推广链接</t-button>
    </div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <div class="subtitle" style="font-size:11px">已邀请人数</div>
        <div style="font-size:24px;font-weight:650;margin-top:8px">{{ team.length }}</div>
      </div>
      <div class="card">
        <div class="subtitle" style="font-size:11px">直推奖释放</div>
        <div style="font-size:24px;font-weight:650;margin-top:8px" class="accent">20 期</div>
      </div>
    </div>

    <div class="section-title" style="margin:22px 0 12px">邀请记录</div>
    <div class="card" style="padding:6px 18px">
      <div v-if="team.length === 0" class="subtitle" style="padding:24px 0;text-align:center">暂无邀请记录</div>
      <div v-for="m in team" :key="m.id" class="list-row row between">
        <div>
          <div style="font-size:13px">{{ m.nickname }}</div>
          <div class="subtitle" style="font-size:11px;margin-top:4px">{{ new Date(m.createdAt).toLocaleDateString('zh-CN') }}</div>
        </div>
        <div class="tag">Lv.{{ m.rankLevel }}</div>
      </div>
    </div>
  </div>
</template>
