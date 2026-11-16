<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useFeaturesStore } from '../stores/features';
import { Crown } from 'lucide-vue-next';

const phone = ref('13900000001');
const password = ref('123456');
const error = ref('');
const loading = ref(false);
const router = useRouter();
const features = useFeaturesStore();

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api<{ token: string }>('/auth/login', {
      method: 'POST', body: { phone: phone.value.trim(), password: password.value.trim() },
    });
    localStorage.setItem('solar_member_token', data.token);
    features.reset();
    sessionStorage.removeItem('solar_partner_checked');
    router.replace('/');
  } catch (e: any) {
    error.value = e.message;
  } finally { loading.value = false; }
}
</script>

<template>
  <div class="page" style="padding-top:80px">
    <div style="text-align:center;margin-bottom:36px">
      <div style="width:64px;height:64px;margin:0 auto;border-radius:20px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#d4a759,#b8863a);color:#1a1408"><Crown :size="28" aria-hidden="true" /></div>
      <div class="title" style="margin-top:20px">合伙人中心</div>
      <div class="subtitle">等级 · 团队 · 分红管理</div>
    </div>
    <div class="card">
      <div style="margin-bottom:16px"><div class="subtitle" style="margin-bottom:8px">手机号</div><input v-model="phone" class="input" placeholder="请输入手机号" /></div>
      <div style="margin-bottom:20px"><div class="subtitle" style="margin-bottom:8px">密码</div><input v-model="password" class="input" type="password" placeholder="请输入密码" @keyup.enter="submit" /></div>
      <div v-if="error" style="color:#fca5a5;font-size:12px;margin-bottom:14px">{{ error }}</div>
      <button class="btn btn-primary" style="width:100%" :disabled="loading" @click="submit">{{ loading ? '登录中…' : '进入合伙人中心' }}</button>
      <div class="subtitle" style="text-align:center;margin-top:16px;font-size:11px">需达到业务主任等级（Lv.1）方可进入</div>
    </div>
  </div>
</template>
