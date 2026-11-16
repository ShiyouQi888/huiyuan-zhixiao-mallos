<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, post } from '../api';
import { useUserStore } from '../stores/user';
import { Toast } from './_toast';
import PageHeading from '../components/PageHeading.vue';
import { Check, KeyRound, ShieldCheck } from 'lucide-vue-next';

const store = useUserStore();
const configured = ref(false);
const loading = ref(true);
const saving = ref(false);
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const error = ref('');
const valid = computed(() => /^\d{6}$/.test(newPassword.value) && newPassword.value === confirmPassword.value &&
  (!configured.value || /^\d{6}$/.test(currentPassword.value)) && !saving.value);

async function load() {
  loading.value = true;
  try {
    const result = await api<{ transferPasswordSet: boolean }>('/me/security');
    configured.value = result.transferPasswordSet;
    if (store.profile) store.profile.transferPasswordSet = result.transferPasswordSet;
  } catch (cause: any) {
    error.value = cause.message ?? '安全设置加载失败';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!valid.value) return;
  saving.value = true;
  error.value = '';
  try {
    await post('/me/transfer-password', {
      ...(configured.value ? { currentPassword: currentPassword.value } : {}),
      newPassword: newPassword.value,
    });
    configured.value = true;
    if (store.profile) store.profile.transferPasswordSet = true;
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    Toast('转账支付密码已保存', 'success');
  } catch (cause: any) {
    error.value = cause.message ?? '密码保存失败';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="page transfer-password-page">
    <PageHeading back eyebrow="账户安全" title="转账支付密码" subtitle="发起钱包转账或权益转让时需要验证" />

    <section class="security-status-card" :class="{ 'security-status-card--ready': configured }">
      <span class="security-status-icon"><ShieldCheck :size="20" aria-hidden="true" /></span>
      <div><strong>{{ configured ? '支付密码已设置' : '尚未设置支付密码' }}</strong><span>{{ configured ? '转账时将要求验证 6 位支付密码' : '设置后即可发起钱包转账和权益转让' }}</span></div>
      <Check v-if="configured" :size="17" class="security-status-check" aria-hidden="true" />
    </section>

    <section class="security-form-card">
      <div class="security-form-title"><KeyRound :size="17" aria-hidden="true" /><strong>{{ configured ? '修改支付密码' : '设置支付密码' }}</strong></div>
      <div v-if="loading" class="security-loading" aria-label="安全设置加载中"><span class="skeleton-block" /><span class="skeleton-block" /></div>
      <form v-else class="security-form" @submit.prevent="save">
        <label v-if="configured" class="app-field"><span>当前支付密码</span><input v-model="currentPassword" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="请输入当前 6 位密码" /></label>
        <label class="app-field"><span>新支付密码</span><input v-model="newPassword" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="设置 6 位数字密码" /></label>
        <label class="app-field"><span>确认新密码</span><input v-model="confirmPassword" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="再次输入新密码" /></label>
        <p class="security-hint">请勿使用生日、连续数字或与登录密码相同的密码。平台不会以明文保存支付密码。</p>
        <div v-if="error" class="security-error" role="alert">{{ error }}</div>
        <button type="submit" class="btn btn-primary security-submit" :disabled="!valid">{{ saving ? '保存中…' : configured ? '确认修改' : '设置支付密码' }}</button>
      </form>
    </section>

    <div class="security-notice"><ShieldCheck :size="16" aria-hidden="true" /><span>连续输错 5 次将锁定验证 15 分钟。忘记密码后需完成身份核验才能重置，请联系平台客服。</span></div>
  </main>
</template>

<style scoped>
.transfer-password-page { display: grid; align-content: start; gap: 14px; }
.security-status-card { display: flex; align-items: center; gap: 11px; padding: 14px; border: 1px solid color-mix(in srgb, var(--amber) 28%, var(--line)); border-radius: 15px; background: color-mix(in srgb, var(--amber) 9%, var(--surface)); }
.security-status-card--ready { border-color: color-mix(in srgb, var(--green) 26%, var(--line)); background: color-mix(in srgb, var(--green-soft) 58%, var(--surface)); }
.security-status-icon { display: inline-flex; width: 38px; height: 38px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 12px; background: var(--surface); color: var(--brand); }
.security-status-card--ready .security-status-icon { color: var(--green); }
.security-status-card > div { display: grid; min-width: 0; flex: 1; gap: 4px; }
.security-status-card strong { color: var(--text); font-size: 12px; }
.security-status-card span:not(.security-status-icon) { color: var(--muted); font-size: 10px; }
.security-status-check { color: var(--green); }
.security-form-card { padding: 16px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-card); }
.security-form-title { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: var(--text); font-size: 13px; }
.security-form-title svg { color: var(--brand); }
.security-form { display: grid; gap: 11px; }
.security-hint { margin: 0; color: var(--muted); font-size: 10px; line-height: 1.65; }
.security-error { padding: 10px 11px; border: 1px solid color-mix(in srgb, var(--danger) 24%, var(--line)); border-radius: 10px; color: var(--danger); font-size: 11px; }
.security-submit { width: 100%; margin-top: 2px; }
.security-notice { display: flex; align-items: flex-start; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; color: var(--muted); font-size: 10px; line-height: 1.6; }
.security-notice svg { flex: 0 0 auto; margin-top: 1px; color: var(--brand); }
.security-loading { display: grid; gap: 10px; }
.security-loading span { height: 40px; }
</style>
