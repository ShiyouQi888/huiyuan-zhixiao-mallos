<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight, CircleAlert } from 'lucide-vue-next';
import AuthLayout from '../components/AuthLayout.vue';
import { registerMember } from '../adapter';
import { useUserStore } from '../stores/user';

const route = useRoute();
const router = useRouter();
const store = useUserStore();
const nickname = ref('');
const phone = ref('');
const password = ref('');
const inviteCode = ref(String(route.query.code ?? route.query.inviteCode ?? '').trim().toUpperCase());
const error = ref('');
const loading = ref(false);
const nicknameValid = computed(() => nickname.value.trim().length >= 2 && nickname.value.trim().length <= 64);
const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(phone.value));
const passwordValid = computed(() => password.value.length >= 8 && password.value.length <= 64);
const inviteCodeValid = computed(() => inviteCode.value.length <= 32);
const formValid = computed(() => nicknameValid.value && phoneValid.value && passwordValid.value && inviteCodeValid.value);

watch(phone, (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits !== value) phone.value = digits;
});
watch(inviteCode, (value) => {
  const normalized = value.replace(/[^a-z\d]/gi, '').slice(0, 32).toUpperCase();
  if (normalized !== value) inviteCode.value = normalized;
});

async function submit() {
  if (!formValid.value || loading.value) return;
  error.value = '';
  loading.value = true;
  try {
    const data = await registerMember({
      nickname: nickname.value.trim(),
      phone: phone.value,
      password: password.value,
      ...(inviteCode.value ? { inviteCode: inviteCode.value } : {}),
    });
    store.setToken(data.token);
    await store.loadProfile();
    router.replace('/');
  } catch (e: any) {
    error.value = e.message ?? '注册失败，请检查填写内容后重试';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout title="创建会员账号" description="填写基础信息，加入太阳线会员商城。">
    <form @submit.prevent="submit">
      <div class="auth-form-heading">
        <h2>注册新账号</h2>
        <p>注册后即可查看会员商城商品与账户权益</p>
      </div>

      <div v-if="error" class="auth-error" role="alert"><CircleAlert :size="15" aria-hidden="true" />{{ error }}</div>

      <label class="auth-field">
        <span>昵称</span>
        <t-input v-model="nickname" maxlength="64" autocomplete="nickname"
          placeholder="请输入昵称（2–64 个字符）" aria-label="昵称" @input="error = ''" />
      </label>
      <label class="auth-field">
        <span>手机号</span>
        <t-input v-model="phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel"
          placeholder="请输入 11 位大陆手机号" aria-label="手机号" @input="error = ''" />
      </label>
      <label class="auth-field">
        <span>登录密码</span>
        <t-input v-model="password" type="password" maxlength="64" autocomplete="new-password"
          placeholder="请设置 8–64 位密码" aria-label="登录密码" @input="error = ''" />
      </label>
      <label class="auth-field auth-invite-field">
        <span>邀请码<span class="auth-optional">选填</span></span>
        <t-input v-model="inviteCode" maxlength="32" autocomplete="off"
          placeholder="请输入推荐人的邀请码" aria-label="邀请码" @input="error = ''" />
        <small class="auth-hint">填写后将自动绑定推荐关系，注册后不可自行更改。</small>
      </label>

      <t-button theme="primary" block :loading="loading" :disabled="!formValid" class="auth-actions" type="submit">
        {{ loading ? '正在创建账号…' : '创建会员账号' }}<ArrowRight :size="16" aria-hidden="true" />
      </t-button>

      <div class="auth-meta-row auth-register-meta">
        <span>已有账号？<router-link to="/login">返回登录</router-link></span>
      </div>
    </form>
  </AuthLayout>
</template>

<style scoped>
.auth-invite-field { margin-bottom: 4px; }
.auth-hint { margin: -3px 0 0; }
.auth-register-meta { justify-content: center; }
</style>
