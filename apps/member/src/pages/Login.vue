<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { login } from '../adapter';
import { useUserStore } from '../stores/user';
import AppModal from '../components/AppModal.vue';
import { ArrowRight, Sun } from 'lucide-vue-next';

const phone = ref('13900000001');
const password = ref('123456');
const error = ref('');
const errorOpen = ref(false);
const loading = ref(false);
const router = useRouter();
const store = useUserStore();

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const data = await login(phone.value.trim(), password.value.trim());
    store.setToken(data.token);
    await store.loadProfile();
    router.replace('/');
  } catch (e: any) {
    error.value = e.message ?? '登录失败';
    errorOpen.value = true;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="page login-page">
    <div class="login-brand">
      <div class="brand-mark"><Sun :size="28" stroke-width="1.7" aria-hidden="true" /></div>
      <div class="login-eyebrow">SOLAR MEMBER</div>
      <h1>欢迎回来</h1>
      <p>登录太阳线会员商城，查看会员专属价格与账户权益</p>
      <div class="login-benefits">
        <span>会员专属价</span>
        <span>权益值抵扣</span>
        <span>余额支付</span>
      </div>
    </div>

    <form class="login-form" @submit.prevent="submit">
      <label class="login-field">
        <span>手机号</span>
        <t-input v-model="phone" placeholder="请输入手机号" type="tel" autocomplete="tel" aria-label="手机号" />
      </label>
      <label class="login-field">
        <span>登录密码</span>
        <t-input v-model="password" type="password" placeholder="请输入登录密码" autocomplete="current-password" aria-label="登录密码" @enter="submit" />
      </label>
      <t-button theme="primary" block :loading="loading" class="login-submit" type="submit">
        {{ loading ? '正在登录…' : '登录会员账号' }}<ArrowRight :size="16" aria-hidden="true" />
      </t-button>
      <t-button theme="default" variant="outline" block class="login-demo"
        @click="phone = '13900000001'; password = '123456'; error = ''">
        填入演示账号
      </t-button>
      <div class="demo-credentials">演示账号：13900000001 · 密码 123456</div>
    </form>
    <div class="login-footer">太阳线会员服务 · 安全登录</div>

    <AppModal v-model="errorOpen" eyebrow="登录校验" title="登录未完成" alert
      :description="error" confirm-text="重新填写" hint="请检查手机号与密码后重试。"
      @confirm="errorOpen = false; password = ''">
      <div class="app-modal-note">可点击「填入演示账号」快速体验，或确认后重新输入登录信息。</div>
    </AppModal>
  </main>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  justify-content: center;
  padding: 34px 22px calc(30px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 50% -12%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 52%),
    var(--bg);
}
.login-brand { margin: 0 0 24px; text-align: center; }
.login-brand .brand-mark { width: 62px; height: 62px; border-radius: 20px; }
.login-eyebrow { margin-top: 17px; color: var(--brand); font-size: 9px; font-weight: 750; letter-spacing: .2em; }
.login-brand h1 { margin: 7px 0 0; color: var(--text); font-size: 26px; font-weight: 800; letter-spacing: -.035em; }
.login-brand p { max-width: 265px; margin: 8px auto 0; color: var(--muted); font-size: 11.5px; line-height: 1.65; }
.login-benefits { display: flex; justify-content: center; gap: 6px; margin-top: 13px; }
.login-benefits span {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 9.5px;
  box-shadow: 0 2px 8px rgba(17, 24, 39, 0.05);
}
.login-form {
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface);
  box-shadow: var(--shadow-float);
}
.login-field { display: grid; gap: 8px; margin-bottom: 14px; color: var(--muted); font-size: 11px; font-weight: 600; }
.login-submit { display: flex; gap: 7px; min-height: 48px; margin-top: 20px; font-size: 15px; }
.login-demo { display: flex; min-height: 42px; margin-top: 10px; font-size: 12px; }
.demo-credentials { margin-top: 12px; color: var(--muted); font-size: 9.5px; text-align: center; }
.login-footer { margin-top: 20px; color: var(--muted); font-size: 9.5px; text-align: center; }
</style>
