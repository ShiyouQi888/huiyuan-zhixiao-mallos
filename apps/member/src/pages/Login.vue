<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRight, CircleAlert } from 'lucide-vue-next';
import AuthLayout from '../components/AuthLayout.vue';
import { login } from '../adapter';
import { useUserStore } from '../stores/user';

const phone = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const isDevelopment = import.meta.env.DEV;
const router = useRouter();
const store = useUserStore();
const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value));
const formValid = computed(() => phoneValid.value && password.value.length > 0);

watch(phone, (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits !== value) phone.value = digits;
});

async function submit() {
  if (!formValid.value || loading.value) return;
  error.value = '';
  loading.value = true;
  try {
    const data = await login(phone.value, password.value);
    store.setToken(data.token);
    await store.loadProfile();
    router.replace('/');
  } catch (e: any) {
    error.value = e.message ?? '登录失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout title="欢迎回来" description="登录太阳线会员商城，查看专属价格与账户权益。">
    <form @submit.prevent="submit">
      <div v-if="error" class="auth-error" role="alert"><CircleAlert :size="15" aria-hidden="true" />{{ error }}</div>

      <label class="auth-field">
        <span>手机号</span>
        <t-input v-model="phone" type="tel" inputmode="numeric" maxlength="11"
          autocomplete="tel" placeholder="请输入 11 位大陆手机号" aria-label="手机号" @input="error = ''" />
      </label>
      <label class="auth-field">
        <span>登录密码</span>
        <t-input v-model="password" type="password" maxlength="64"
          autocomplete="current-password" placeholder="请输入登录密码" aria-label="登录密码" @input="error = ''" />
      </label>

      <t-button theme="primary" block :loading="loading" :disabled="!formValid" class="auth-actions" type="submit">
        {{ loading ? '正在登录…' : '登录会员账号' }}<ArrowRight :size="16" aria-hidden="true" />
      </t-button>

      <div class="auth-meta-row">
        <button v-if="isDevelopment" type="button" class="auth-text-button"
          @click="phone = '13900000001'; password = '123456'; error = ''">填入演示账号</button>
        <span v-else />
        <span>还没有账号？<router-link to="/register">立即注册</router-link></span>
      </div>
    </form>
  </AuthLayout>
</template>
