<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, money } from '../api';
import { useUserStore } from '../stores/user';
import { Toast } from './_toast';
import AppModal from '../components/AppModal.vue';
import { ArrowRight, BadgeCheck, ChevronRight, Crown, KeyRound, MapPin, ShieldCheck, ShoppingBag, WalletCards } from 'lucide-vue-next';

const store = useUserStore();
const router = useRouter();
const showRealname = ref(false);
const realName = ref('');
const idCard = ref('');
const canSeeWallet = computed(() => store.has('wallet.account'));
const canSeeTransferQuota = computed(() => store.has('wallet.transfer_quota'));
const canSeeAssets = computed(() => canSeeWallet.value || canSeeTransferQuota.value || store.has('token.view'));

onMounted(() => store.loadProfile().catch(() => {}));

async function submitRealname() {
  try {
    await api('/me/realname', { method: 'POST', body: { realName: realName.value, idCard: idCard.value } });
    if (store.profile) store.profile.realNameStatus = 2;
    showRealname.value = false;
    Toast('实名认证申请已提交，审核通过后即可使用相关功能', 'success');
  } catch (e: any) { Toast(e.message, 'danger'); }
}

function goPartner() {
  const a = store.access;
  if (!a?.partner?.available) {
    Toast(a?.partner?.reason ?? '达到业务主任等级后可进入合伙人中心', 'warning');
    return;
  }
  const base = import.meta.env.VITE_PARTNER_URL as string | undefined;
  window.location.href = `${base ?? 'http://localhost:5175'}/#/auth?token=${encodeURIComponent(store.token)}`;
}

function logout() {
  store.logout();
  router.replace('/login');
}
</script>

<template>
  <main class="page mine-page">
    <section class="profile-hero">
      <div class="profile-hero-top">
        <span class="profile-hero-label">会员账户</span>
        <span v-if="store.profile?.realNameStatus === 1" class="verified-tag"><BadgeCheck :size="13" aria-hidden="true" />已实名</span>
        <span v-else-if="store.profile?.realNameStatus === 2" class="verified-tag">审核中</span>
      </div>
      <div class="profile-main">
        <div class="profile-avatar">
          {{ (store.profile?.nickname ?? '会')[0] }}
        </div>
        <div class="grow">
          <div class="profile-name">{{ store.profile?.nickname ?? '会员' }}</div>
          <div class="profile-phone">{{ store.profile?.phone ?? '手机号暂不可用' }}</div>
        </div>
      </div>
    </section>

    <!-- 合伙人中心入口 -->
    <button type="button" class="partner-entry" @click="goPartner">
      <span class="partner-entry-icon"><Crown :size="20" aria-hidden="true" /></span>
      <span class="partner-entry-copy">
        <span class="partner-entry-title">合伙人中心</span>
        <span class="partner-entry-description">
          {{ store.access?.partner?.available ? '进入等级、团队与奖励管理' : store.access?.partner?.reason ?? '等级达标后解锁专属服务' }}
        </span>
      </span>
      <ArrowRight :size="17" aria-hidden="true" />
    </button>

    <div v-if="canSeeAssets && (canSeeWallet || canSeeTransferQuota)" class="profile-assets" :class="{ 'profile-assets--single': canSeeWallet !== canSeeTransferQuota }">
      <button v-if="canSeeWallet" type="button" class="profile-asset-card" @click="router.push('/assets')">
        <span class="profile-asset-icon"><WalletCards :size="17" aria-hidden="true" /></span>
        <div>
          <small>钱包余额</small><strong>¥{{ money(store.profile?.wallet?.balance) }}</strong>
        </div>
      </button>
      <button v-if="canSeeTransferQuota" type="button" class="profile-asset-card profile-asset-card--quota" @click="router.push('/assets')">
        <span class="profile-asset-icon"><BadgeCheck :size="17" aria-hidden="true" /></span>
        <div><small>可用权益通</small><strong>{{ money(store.profile?.transferQuotaAccount?.available) }}</strong></div>
      </button>
    </div>

    <nav class="account-menu" aria-label="账户服务">
      <router-link to="/orders" class="account-menu-item"><span class="account-menu-icon"><ShoppingBag :size="17" aria-hidden="true" /></span><span>我的订单</span><ChevronRight :size="16" aria-hidden="true" /></router-link>
      <router-link v-if="canSeeAssets" to="/assets" class="account-menu-item"><span class="account-menu-icon"><WalletCards :size="17" aria-hidden="true" /></span><span>资产中心</span><ChevronRight :size="16" aria-hidden="true" /></router-link>
      <router-link v-if="store.has('address.manage')" to="/addresses" class="account-menu-item"><span class="account-menu-icon"><MapPin :size="17" aria-hidden="true" /></span><span>收货地址</span><ChevronRight :size="16" aria-hidden="true" /></router-link>
      <router-link v-if="store.has('transfer.password')" to="/security/transfer-password" class="account-menu-item"><span class="account-menu-icon"><KeyRound :size="17" aria-hidden="true" /></span><span>转账支付密码</span><span class="account-menu-status">{{ store.profile?.transferPasswordSet ? '已设置' : '未设置' }}</span><ChevronRight :size="16" aria-hidden="true" /></router-link>
      <button v-if="store.has('realname')" type="button" class="account-menu-item" :disabled="store.profile?.realNameStatus === 1 || store.profile?.realNameStatus === 2" @click="showRealname = true">
        <span class="account-menu-icon"><ShieldCheck :size="17" aria-hidden="true" /></span><span>实名认证</span>
        <span class="account-menu-status">{{ store.profile?.realNameStatus === 1 ? '已完成' : store.profile?.realNameStatus === 2 ? '审核中' : store.profile?.realNameStatus === 3 ? '未通过，重新提交' : '立即认证' }}</span><ChevronRight :size="16" aria-hidden="true" />
      </button>
    </nav>

    <t-button theme="danger" variant="outline" block class="logout-button" @click="logout">退出登录</t-button>

    <AppModal v-if="store.has('realname')" v-model="showRealname" eyebrow="身份核验" title="实名认证"
      description="完成实名并经平台审核后可使用会员转账等功能。" confirm-text="提交认证"
      hint="身份信息仅用于核验，平台将严格保密。" @confirm="submitRealname">
      <label class="app-field"><span>真实姓名</span><input v-model="realName" class="input" autocomplete="name" placeholder="请输入真实姓名" /></label>
      <label class="app-field"><span>身份证号</span><input v-model="idCard" class="input" autocomplete="off" placeholder="请输入身份证号" /></label>
    </AppModal>
  </main>
</template>

<style scoped>
.mine-page { padding-top: calc(env(safe-area-inset-top) + 12px); }
.profile-hero {
  position: relative;
  overflow: hidden;
  padding: 16px 17px 18px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 96% -18%, rgba(255, 255, 255, 0.28), transparent 46%),
    linear-gradient(120deg, #ff8a4c 0%, #f45a1f 54%, #e3410c 100%);
  color: #fff;
  box-shadow: 0 12px 28px rgba(224, 66, 12, 0.22);
}
.profile-hero::after {
  position: absolute;
  right: -34px;
  bottom: -62px;
  width: 132px;
  height: 132px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 999px;
  content: '';
  pointer-events: none;
}
.profile-hero-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.profile-hero-label { color: rgba(255, 255, 255, 0.8); font-size: 10px; font-weight: 600; letter-spacing: .1em; }
.profile-main { position: relative; z-index: 1; display: flex; min-width: 0; align-items: center; gap: 12px; margin-top: 13px; }
.profile-avatar {
  display: flex;
  width: 52px;
  height: 52px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.36);
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 20px;
  font-weight: 750;
}
.profile-name { color: #fff; font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
.profile-phone { margin-top: 4px; color: rgba(255, 255, 255, 0.76); font-size: 11px; }
.verified-tag { display: inline-flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.2); color: #fff; font-size: 10px; font-weight: 600; white-space: nowrap; }
.partner-entry { display: flex; width: 100%; align-items: center; gap: 11px; margin-top: 12px; padding: 14px; border: 1px solid color-mix(in srgb, var(--gold) 26%, var(--line)); border-radius: 15px; background: linear-gradient(115deg, color-mix(in srgb, var(--gold) 12%, var(--surface)), var(--surface)); color: var(--gold); text-align: left; cursor: pointer; }
.partner-entry-icon { display: inline-flex; width: 39px; height: 39px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 12px; background: color-mix(in srgb, var(--gold) 15%, var(--surface)); }
.partner-entry-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; }
.partner-entry-title { color: var(--text); font-size: 13px; font-weight: 700; }
.partner-entry-description { overflow: hidden; color: var(--muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.profile-assets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 11px; }
.profile-assets--single { grid-template-columns: 1fr; }
.profile-asset-card { display: flex; min-width: 0; align-items: center; gap: 9px; padding: 13px 11px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--text); text-align: left; box-shadow: var(--shadow-card); cursor: pointer; }
.profile-asset-icon { display: flex; width: 34px; height: 34px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 11px; background: var(--brand-soft); color: var(--brand); }
.profile-asset-card--quota .profile-asset-icon { background: var(--green-soft); color: var(--green); }
.profile-asset-card div { display: flex; min-width: 0; flex-direction: column; gap: 5px; }
.profile-asset-card small { color: var(--muted); font-size: 10px; white-space: nowrap; }
.profile-asset-card strong { overflow: hidden; font-family: var(--font-num); font-size: 16px; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
.account-menu { margin-top: 13px; padding: 2px 14px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); box-shadow: var(--shadow-card); }
.account-menu-item { display: flex; width: 100%; min-height: 50px; align-items: center; gap: 9px; padding: 0; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--text); font: inherit; font-size: 13px; text-align: left; text-decoration: none; cursor: pointer; }
.account-menu-item:last-child { border-bottom: 0; }
.account-menu-item > span:nth-child(2) { flex: 1; }
.account-menu-item > svg { color: var(--muted); }
.account-menu-icon { display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center; border-radius: 9px; background: var(--surface-2); color: var(--brand); }
.account-menu-status { color: var(--muted); font-size: 10px; }
.account-menu-item:disabled { cursor: default; }
.logout-button { display: flex; gap: 7px; min-height: 46px; margin-top: 14px; font-size: 13px; }
</style>
