<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api, money, post } from '../api';
import { useUserStore } from '../stores/user';
import { Toast } from './_toast';
import PageHeading from '../components/PageHeading.vue';
import EmptyState from '../components/EmptyState.vue';
import AppModal from '../components/AppModal.vue';
import { ArrowDownLeft, ArrowUpRight, BadgeDollarSign, Coins, WalletCards } from 'lucide-vue-next';

type AssetTab = 'wallet' | 'equity' | 'token';
const store = useUserStore();
const router = useRouter();
const tab = ref<AssetTab>('wallet');
const wallet = ref<any>(null);
const equity = ref<any>(null);
const token = ref<any>(null);
const txs = ref<any[]>([]);
const showTransfer = ref(false);
const toPhone = ref('');
const amount = ref('');
const paymentPassword = ref('');
const error = ref('');
const busy = ref(false);

const allTabs = [
  { key: 'wallet' as const, label: '钱包余额', icon: WalletCards },
  { key: 'equity' as const, label: '权益值', icon: BadgeDollarSign },
  { key: 'token' as const, label: '数权', icon: Coins },
];
const featureForTab: Record<AssetTab, string> = {
  wallet: 'wallet.account', equity: 'equity.account', token: 'token.view',
};
const tabs = computed(() => allTabs.filter((item) => store.has(featureForTab[item.key])));
const assetTitle = computed(() => tabs.value.find((item) => item.key === tab.value)?.label ?? '我的资产');
const validTransfer = computed(() => Boolean(toPhone.value.trim()) && Number(amount.value) > 0 && !busy.value &&
  /^\d{6}$/.test(paymentPassword.value) && store.has(tab.value === 'wallet' ? 'wallet.transfer' : 'equity.transfer'));

watch(tabs, (available) => {
  if (available.length && !available.some((item) => item.key === tab.value)) tab.value = available[0].key;
}, { immediate: true });

async function loadTx() {
  if (!store.has(featureForTab[tab.value])) { txs.value = []; return; }
  if (tab.value === 'token') { txs.value = []; return; }
  const path = tab.value === 'wallet' ? '/me/wallet/transactions' : '/me/equity/transactions';
  txs.value = (await api<any>(path).catch(() => null))?.list ?? [];
}

async function load() {
  await store.loadProfile().catch(() => {});
  const [w, e, t] = await Promise.all([
    store.has('wallet.account') ? api<any>('/me/wallet').catch(() => null) : Promise.resolve(null),
    store.has('equity.account') ? api<any>('/me/equity').catch(() => null) : Promise.resolve(null),
    store.has('token.view') ? api<any>('/me/token').catch(() => null) : Promise.resolve(null),
  ]);
  wallet.value = w; equity.value = e; token.value = t;
  await loadTx();
}

function switchTab(next: AssetTab) {
  if (!store.has(featureForTab[next])) return;
  tab.value = next;
  loadTx();
}

async function transfer() {
  if (!validTransfer.value) return;
  error.value = '';
  busy.value = true;
  try {
    const path = tab.value === 'wallet' ? '/me/wallet/transfers' : '/me/equity/transfers';
    await post(path, { toPhone: toPhone.value.trim(), amount: Number(amount.value), paymentPassword: paymentPassword.value });
    Toast('转账已发起，等待对方 24 小时内确认', 'success');
    showTransfer.value = false;
    toPhone.value = ''; amount.value = ''; paymentPassword.value = '';
    await load();
  } catch (e: any) {
    error.value = e.message ?? '操作失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <main class="page">
    <PageHeading back eyebrow="资产中心" title="我的资产" subtitle="查看账户余额、权益批次与资金变动记录" />

    <div v-if="tabs.length" class="asset-tabs" role="tablist" aria-label="资产类型">
      <button v-for="item in tabs" :key="item.key" type="button" role="tab" class="asset-tab"
        :class="{ active: tab === item.key }" :aria-selected="tab === item.key" @click="switchTab(item.key)">
        <component :is="item.icon" :size="16" aria-hidden="true" />{{ item.label }}
      </button>
    </div>

    <EmptyState v-if="!tabs.length" title="资产功能暂不可用" description="当前账号没有开放的资产查看权限。" />

    <section v-else-if="tab === 'wallet'" class="asset-overview asset-overview--wallet">
      <div class="asset-overview-top"><span class="asset-icon"><WalletCards :size="19" aria-hidden="true" /></span><span>可用余额</span></div>
      <div class="asset-balance">¥{{ money(wallet?.available) }}</div>
      <div class="asset-overview-foot">
        <span>账户余额 ¥{{ money(wallet?.balance) }}</span><span>冻结 ¥{{ money(wallet?.frozen) }}</span>
      </div>
      <button v-if="store.has('wallet.transfer') && store.profile?.transferPasswordSet" type="button" class="asset-transfer-button" @click="error = ''; showTransfer = true">发起转账</button>
      <button v-else-if="store.has('wallet.transfer')" type="button" class="asset-transfer-button" @click="router.push('/security/transfer-password')">设置支付密码</button>
    </section>

    <section v-else-if="tab === 'equity'" class="asset-overview asset-overview--equity">
      <div class="asset-overview-top"><span class="asset-icon"><BadgeDollarSign :size="19" aria-hidden="true" /></span><span>可用权益值</span></div>
      <div class="asset-balance">{{ money(equity?.balance) }}</div>
      <div class="asset-overview-foot">
        <span>{{ equity?.lots?.length ?? 0 }} 个有效批次</span><span>按到期时间优先抵扣</span>
      </div>
      <button v-if="store.has('equity.transfer') && store.profile?.transferPasswordSet" type="button" class="asset-transfer-button" @click="error = ''; showTransfer = true">发起转让</button>
      <button v-else-if="store.has('equity.transfer')" type="button" class="asset-transfer-button" @click="router.push('/security/transfer-password')">设置支付密码</button>
      <div v-if="equity?.lots?.length" class="equity-lots">
        <div v-for="lot in equity.lots.slice(0, 4)" :key="lot.id" class="equity-lot">
          <span>批次余额 {{ money(lot.remaining) }}</span><span>{{ String(lot.expireAt).slice(0, 10) }} 到期</span>
        </div>
      </div>
    </section>

    <section v-else class="asset-overview asset-overview--token">
      <div class="asset-overview-top"><span class="asset-icon"><Coins :size="19" aria-hidden="true" /></span><span>累计数权</span></div>
      <div class="asset-balance">{{ money(token?.total) }}</div>
      <p class="asset-description">数权为奖金分配中的记账部分，仅作记录，不参与消费与转让。</p>
    </section>

    <div v-if="tabs.length" class="asset-section-head">
      <div><h2>{{ tab === 'token' ? '数权说明' : `${assetTitle}流水` }}</h2><p>{{ tab === 'token' ? '了解数权的记录与使用范围' : '按发生时间展示账户变动' }}</p></div>
    </div>
    <div v-if="tabs.length && tab === 'token'" class="asset-note">
      <Coins :size="18" aria-hidden="true" /><span>数权由平台按奖金规则记账，不可提现、消费或转让。</span>
    </div>
    <div v-else-if="tabs.length && txs.length" class="transaction-list">
      <article v-for="tx in txs" :key="tx.id" class="transaction-row">
        <span class="transaction-icon" :class="{ 'transaction-icon--out': Number(tx.changeAmount) < 0 }">
          <ArrowDownLeft v-if="Number(tx.changeAmount) >= 0" :size="17" aria-hidden="true" />
          <ArrowUpRight v-else :size="17" aria-hidden="true" />
        </span>
        <div class="transaction-copy"><strong>{{ tx.bizType }}</strong><span>{{ new Date(tx.createdAt).toLocaleString('zh-CN') }}</span></div>
        <strong class="transaction-amount" :class="{ 'transaction-amount--positive': Number(tx.changeAmount) >= 0 }">
          {{ Number(tx.changeAmount) >= 0 ? '+' : '' }}{{ money(tx.changeAmount) }}
        </strong>
      </article>
    </div>
    <EmptyState v-else-if="tabs.length && tab !== 'token'" title="暂无交易流水" description="账户发生变动后，记录会显示在这里" />

    <p v-if="tabs.length" class="asset-disclaimer">平台资产仅限系统内按业务规则使用，具体规则以平台公示为准。</p>

    <AppModal v-if="store.profile?.transferPasswordSet && (store.has('wallet.transfer') || store.has('equity.transfer'))" v-model="showTransfer" eyebrow="资产操作" :title="`发起${tab === 'wallet' ? '转账' : '转让'}`"
      :description="error || '填写对方手机号与数量，提交后等待对方确认。'"
      :confirm-loading="busy" :confirm-disabled="!validTransfer" confirm-text="确认发起"
      hint="需验证转账支付密码；对方应在 24 小时内确认，逾期将按平台规则处理。" @confirm="transfer"
      @cancel="paymentPassword = ''; error = ''">
      <label class="app-field"><span>对方手机号</span><t-input v-model="toPhone" type="tel" placeholder="请输入已实名会员手机号" /></label>
      <label class="app-field"><span>{{ tab === 'wallet' ? '转账金额' : '转让权益值' }}</span><t-input v-model="amount" type="number" placeholder="请输入数量" /></label>
      <label class="app-field"><span>转账支付密码</span><input v-model="paymentPassword" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="请输入 6 位数字密码" /></label>
    </AppModal>
  </main>
</template>

<style scoped>
.asset-tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 6px; margin: -3px 0 14px; padding: 5px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface); box-shadow: var(--shadow-card); }
.asset-tab { display: inline-flex; min-width: 0; height: 36px; align-items: center; justify-content: center; gap: 5px; border: 0; border-radius: 9px; background: transparent; color: var(--muted); font: inherit; font-size: 11px; font-weight: 600; white-space: nowrap; cursor: pointer; }
.asset-tab svg { color: currentColor; }
.asset-tab.active { background: var(--brand-soft); color: var(--brand); }
.asset-overview { position: relative; overflow: hidden; padding: 19px; border-radius: 18px; background: radial-gradient(circle at 92% 4%, rgba(255, 255, 255, .26), transparent 46%), linear-gradient(120deg, #ff8a4c 0%, #f45a1f 56%, #e3410c 100%); color: #fff; box-shadow: 0 12px 28px rgba(224, 66, 12, 0.2); }
.asset-overview--equity { background: radial-gradient(circle at 92% 4%, rgba(255, 255, 255, .24), transparent 46%), linear-gradient(120deg, #2fbf93 0%, #0e9f6e 58%, #0a7f58 100%); box-shadow: 0 12px 28px rgba(10, 127, 88, 0.18); }
.asset-overview--token { background: radial-gradient(circle at 92% 4%, rgba(255, 255, 255, .18), transparent 46%), linear-gradient(120deg, #46506a 0%, #2b3243 60%, #1d2230 100%); box-shadow: 0 12px 28px rgba(15, 23, 42, 0.24); }
.asset-overview-top { display: flex; align-items: center; gap: 8px; color: rgba(255, 255, 255, .82); font-size: 11px; font-weight: 600; }
.asset-icon { display: inline-flex; width: 34px; height: 34px; align-items: center; justify-content: center; border-radius: 10px; background: rgba(255, 255, 255, .18); color: #fff; }
.asset-balance { margin-top: 13px; color: #fff; font-family: var(--font-num); font-size: 32px; font-weight: 800; letter-spacing: -.03em; }
.asset-overview-foot { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 9px; color: rgba(255, 255, 255, .78); font-size: 10px; }
.asset-transfer { position: absolute; right: 16px; top: 18px; }
.asset-transfer-button { position: absolute; top: 17px; right: 16px; display: inline-flex; min-height: 30px; align-items: center; justify-content: center; padding: 0 12px; border: 0; border-radius: 9px; background: #fff; color: #e8460d; font: inherit; font-size: 11px; font-weight: 700; white-space: nowrap; cursor: pointer; box-shadow: 0 4px 12px rgba(15, 23, 42, .12); }
.asset-overview--equity .asset-transfer-button { color: #0a7f58; }
.asset-overview--token .asset-transfer-button { color: #2b3243; }
.equity-lots { display: grid; gap: 8px; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, .22); }
.equity-lot { display: flex; justify-content: space-between; gap: 10px; color: rgba(255, 255, 255, .78); font-size: 10px; }
.asset-description { max-width: 290px; margin: 10px 0 0; color: rgba(255, 255, 255, .78); font-size: 10.5px; line-height: 1.65; }
.asset-section-head { display: flex; align-items: flex-end; justify-content: space-between; margin: 23px 0 12px; }
.asset-section-head h2 { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 14.5px; font-weight: 700; }
.asset-section-head h2::before { content: ''; width: 3px; height: 13px; border-radius: 2px; background: linear-gradient(180deg, #ff8a4c, #f4470f); }
.asset-section-head p { margin: 4px 0 0 10px; color: var(--muted); font-size: 10px; }
.transaction-list { overflow: hidden; padding: 0 14px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); box-shadow: var(--shadow-card); }
.transaction-row { display: flex; min-width: 0; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--line); }
.transaction-row:last-child { border-bottom: 0; }
.transaction-icon { display: inline-flex; width: 34px; height: 34px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 10px; background: var(--green-soft); color: var(--green); }
.transaction-icon--out { background: color-mix(in srgb, var(--danger) 10%, var(--surface)); color: var(--danger); }
.transaction-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
.transaction-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.transaction-copy span { color: var(--muted); font-size: 10px; }
.transaction-amount { color: var(--danger); font-family: var(--font-num); font-size: 13px; white-space: nowrap; }
.transaction-amount--positive { color: var(--green); }
.asset-note { display: flex; gap: 9px; padding: 14px; border: 1px solid var(--line); border-radius: 13px; background: var(--surface); color: var(--muted); font-size: 10.5px; line-height: 1.6; }
.asset-note svg { flex: 0 0 auto; color: var(--accent); }
.asset-disclaimer { margin: 16px 0 0; color: var(--muted); font-size: 9.5px; line-height: 1.6; text-align: center; }
</style>
