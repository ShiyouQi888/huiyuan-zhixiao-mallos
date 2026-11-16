<script setup lang="ts">
import { Sun } from 'lucide-vue-next';

defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <main class="page auth-page">
    <header class="auth-brand">
      <div class="brand-mark"><Sun :size="27" stroke-width="1.7" aria-hidden="true" /></div>
      <div class="auth-eyebrow">SOLAR MEMBER</div>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
      <div class="auth-benefits" aria-label="会员商城服务">
        <span>会员专属价</span>
        <span>权益值抵扣</span>
        <span>余额支付</span>
      </div>
    </header>

    <section class="auth-card">
      <slot />
    </section>

    <footer class="auth-footer">太阳线会员服务 · H5 会员商城</footer>
  </main>
</template>

<style scoped>
.auth-page {
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  justify-content: center;
  padding: 30px 22px calc(24px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 50% -12%, color-mix(in srgb, var(--brand) 20%, transparent), transparent 52%),
    var(--bg);
}
.auth-brand { margin: 0 0 22px; text-align: center; }
.auth-brand .brand-mark { width: 58px; height: 58px; border-radius: 18px; }
.auth-eyebrow { margin-top: 13px; color: var(--brand); font-size: 9px; font-weight: 750; letter-spacing: .2em; }
.auth-brand h1 { margin: 6px 0 0; color: var(--text); font-size: 25px; font-weight: 800; letter-spacing: -.035em; }
.auth-brand p { max-width: 275px; margin: 7px auto 0; color: var(--muted); font-size: 11.5px; line-height: 1.65; }
.auth-benefits { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 12px; }
.auth-benefits span {
  padding: 4px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-2);
  font-size: 9.5px;
}
.auth-card { padding: 19px; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); box-shadow: var(--shadow-float); }
.auth-footer { margin-top: 17px; color: var(--muted); font-size: 9.5px; text-align: center; }
:deep(.auth-field) { display: grid; gap: 7px; margin-bottom: 13px; color: var(--muted); font-size: 11px; font-weight: 600; }
:deep(.auth-field > span) { color: var(--text-2); }
:deep(.auth-field .t-input) { min-height: 46px; }
:deep(.auth-actions) { display: flex; min-height: 48px; gap: 7px; margin-top: 17px; font-size: 14px; }
:deep(.auth-error) {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-bottom: 12px;
  padding: 10px 11px;
  border: 1px solid color-mix(in srgb, var(--danger) 24%, var(--line));
  border-radius: 11px;
  background: color-mix(in srgb, var(--danger) 7%, var(--surface));
  color: var(--danger);
  font-size: 11px;
  line-height: 1.5;
}
:deep(.auth-error svg) { flex: 0 0 auto; margin-top: 1px; }
:deep(.auth-form-heading) { margin: 0 0 15px; }
:deep(.auth-form-heading h2) { margin: 0; color: var(--text); font-size: 15px; font-weight: 700; }
:deep(.auth-form-heading p) { margin: 5px 0 0; color: var(--muted); font-size: 10.5px; line-height: 1.5; }
:deep(.auth-meta-row) { display: flex; min-height: 28px; align-items: center; justify-content: space-between; gap: 10px; margin-top: 12px; color: var(--muted); font-size: 10.5px; }
:deep(.auth-meta-row a),
:deep(.auth-text-button) { color: var(--brand); font: inherit; text-decoration: none; }
:deep(.auth-text-button) { padding: 4px 0; border: 0; background: transparent; cursor: pointer; }
:deep(.auth-hint) { margin: -5px 0 11px; color: var(--muted); font-size: 9.5px; font-weight: 400; line-height: 1.5; }
:deep(.auth-optional) { margin-left: 5px; color: var(--muted); font-size: 9px; font-weight: 400; }
@media (max-height: 700px) {
  .auth-page { justify-content: flex-start; padding-top: 22px; }
  .auth-brand { margin-bottom: 16px; }
  .auth-brand .brand-mark { width: 50px; height: 50px; border-radius: 16px; }
  .auth-eyebrow { margin-top: 9px; }
  .auth-brand h1 { font-size: 22px; }
  .auth-benefits { margin-top: 8px; }
  :deep(.auth-field) { gap: 5px; margin-bottom: 10px; }
  :deep(.auth-field .t-input) { min-height: 42px; }
}
</style>
