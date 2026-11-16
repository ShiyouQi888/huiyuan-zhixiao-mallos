<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { useFeaturesStore } from '../stores/features';
import { ShieldCheck } from 'lucide-vue-next';

const route = useRoute();
const router = useRouter();
const features = useFeaturesStore();
const message = ref('正在验证身份…');

onMounted(async () => {
  const token = route.query.token as string | undefined;
  if (!token) {
    message.value = '缺少身份凭证，请使用账号登录';
    setTimeout(() => router.replace('/login'), 1500);
    return;
  }
  localStorage.setItem('solar_member_token', token);
  features.reset();
  sessionStorage.removeItem('solar_partner_checked');
  try {
    const res = await fetch(`${(import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3000/api'}/access/partner/check`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.code !== 0) {
      message.value = json.message ?? '暂无合伙人权限';
      setTimeout(() => router.replace('/login'), 1800);
      return;
    }
    sessionStorage.setItem('solar_partner_checked', 'true');
    router.replace('/');
  } catch {
    message.value = '验证失败，请重试';
    setTimeout(() => router.replace('/login'), 1500);
  }
});
</script>

<template>
  <div class="page" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh">
    <ShieldCheck :size="36" style="color:var(--gold)" aria-hidden="true" />
    <div class="subtitle" style="margin-top:20px">{{ message }}</div>
  </div>
</template>
