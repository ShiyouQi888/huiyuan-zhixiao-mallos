<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useFeaturesStore } from '../stores/features';
import ThemeToggle from '../components/ThemeToggle.vue';
import { AlertCircle, Crown } from 'lucide-vue-next';

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
  <main class="auth-page">
    <div class="auth-theme"><ThemeToggle /></div>

    <header class="auth-brand">
      <div class="brand-mark"><Crown :size="27" :stroke-width="1.7" aria-hidden="true" /></div>
      <div class="auth-eyebrow">SOLAR PARTNER</div>
      <h1>合伙人中心</h1>
      <p>等级、团队、收益与分红，一处集中管理</p>
      <div class="auth-benefits" aria-label="合伙人服务">
        <span>职级进度</span>
        <span>团队结构</span>
        <span>收益分红</span>
      </div>
    </header>

    <section class="auth-card">
      <div class="auth-field">
        <span>手机号</span>
        <input v-model="phone" class="input" inputmode="tel" autocomplete="tel" placeholder="请输入手机号" />
      </div>
      <div class="auth-field">
        <span>密码</span>
        <input v-model="password" class="input" type="password" autocomplete="current-password" placeholder="请输入密码" @keyup.enter="submit" />
      </div>

      <div v-if="error" class="auth-error" role="alert">
        <AlertCircle :size="14" aria-hidden="true" />
        <span>{{ error }}</span>
      </div>

      <button type="button" class="btn btn-primary auth-submit" :disabled="loading" @click="submit">
        {{ loading ? '登录中…' : '进入合伙人中心' }}
      </button>
      <p class="auth-hint">需达到业务主任等级（Lv.1）方可进入</p>
    </section>

    <footer class="auth-footer">太阳线合伙人服务 · H5 合伙人中心</footer>
  </main>
</template>
