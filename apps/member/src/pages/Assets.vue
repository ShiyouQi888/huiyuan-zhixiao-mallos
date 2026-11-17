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
const transfers = ref<any[]>([]);
const transferTotal = ref(0);
const transferPage = ref(1);
const showTransfer = ref(false);
const toPhone = ref('');
const amount = ref('');
const paymentPassword = ref('');
const error = ref('');
const busy = ref(false);
const accepting = ref<string>('');

const TRANSFER_STATUS: Record<string, string> = {
  PENDING: '待确认',
  COMPLETED: '已到账',
  REJECTED: '已退回',
  EXPIRED: '已过期',
};
const transferPages = computed(() => Math.max(1, Math.ceil(transferTotal.value / 20)));

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
const transferFeature = computed(() => tab.value === 'wallet' ? 'wallet.transfer' : tab.value === 'equity' ? 'equity.transfer' : 'token.transfer');
const TX_LABEL: Record<string, string> = {
  token_bonus: '奖金数权',
  token_transfer_in: '数权转入',
  token_transfer_out: '数权转出',
  equity_grant: '权益值发放',
  equity_transfer_out: '权益值转出',
  equity_transfer_in: '权益值转入',
  equity_transfer_refund: '权益值退款',
  equity_expire: '权益值过期',
  order_balance: '订单余额抵扣',
};
function txLabel(bizType: string) {
  return TX_LABEL[bizType] ?? bizType;
}
const validTransfer = computed(() => Boolean(toPhone.value.trim()) && Number(amount.value) > 0 && !busy.value &&
  /^\d{6}$/.test(paymentPassword.value) && store.has(transferFeature.value));

watch(tabs, (available) => {
  if (available.length && !available.some((item) => item.key === tab.value)) tab.value = available[0].key;
}, { immediate: true });

async function loadTx() {
  if (!store.has(featureForTab[tab.value])) { txs.value = []; return; }
  const path = tab.value === 'wallet'
    ? '/me/wallet/transactions'
    : tab.value === 'equity'
      ? '/me/equity/transactions'
      : '/me/token/transactions';
  txs.value = (await api<any>(path).catch(() => null))?.list ?? [];
}

async function loadTransfers(page = transferPage.value) {
  if (!store.has(featureForTab[tab.value])) { transfers.value = []; transferTotal.value = 0; return; }
  transferPage.value = page;
  const result = await api<any>(`/me/transfers/${tab.value}?page=${page}`).catch(() => null);
  transfers.value = result?.list ?? [];
  transferTotal.value = result?.total ?? 0;
}

function isMe(id: unknown) {
  return String(id) === String(store.profile?.id ?? '');
}

function counterpart(tx: any) {
  const side = isMe(tx.fromUserId) ? tx.toUser : tx.fromUser;
  return side?.nickname || side?.phone || '未知会员';
}

async function acceptTransfer(tx: any) {
  if (accepting.value) return;
  accepting.value = String(tx.id);
  try {
    const path = tab.value === 'wallet'
      ? `/me/wallet/transfers/${tx.id}/accept`
      : `/me/equity/transfers/${tx.id}/accept`;
    await post(path);
    Toast('已确认接收，资产到账', 'success');
    await load();
  } catch (e: any) {
    Toast(e.message ?? '确认失败，请稍后重试', 'error');
  } finally {
    accepting.value = '';
  }
}

async function load() {
  await store.loadProfile().catch(() => {});
  const [w, e, t] = await Promise.all([
    store.has('wallet.account') ? api<any>('/me/wallet').catch(() => null) : Promise.resolve(null),
    store.has('equity.account') ? api<any>('/me/equity').catch(() => null) : Promise.resolve(null),
    store.has('token.view') ? api<any>('/me/token').catch(() => null) : Promise.resolve(null),
  ]);
  wallet.value = w; equity.value = e; token.value = t;
  await Promise.all([loadTx(), loadTransfers(1)]);
}

function switchTab(next: AssetTab) {
  if (!store.has(featureForTab[next])) return;
  tab.value = next;
  loadTx();
  loadTransfers(1);
}

async function transfer() {
  if (!validTransfer.value) return;
  error.value = '';
  busy.value = true;
  try {
    const path = `/me/${tab.value}/transfers`;
    await post(path, { toPhone: toPhone.value.trim(), amount: Number(amount.value), paymentPassword: paymentPassword.value });
    Toast(tab.value === 'token' ? '数权已即时到账' : '转账已发起，等待对方 24 小时内确认', 'success');
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
      <p class="asset-description">权益值可用于下单抵扣与会员间转账，额度用完后可通过复消恢复计酬。</p>
      <button v-if="store.has('equity.transfer') && store.profile?.transferPasswordSet" type="button" class="asset-transfer-button" @click="error = ''; showTransfer = true">发起转让</button>
      <button v-else-if="store.has('equity.transfer')" type="button" class="asset-transfer-button" @click="router.push('/security/transfer-password')">设置支付密码</button>
      <div v-if="equity?.lots?.length" class="equity-lots">
        <div v-for="lot in equity.lots.slice(0, 4)" :key="lot.id" class="equity-lot">
          <span>批次余额 {{ money(lot.remaining) }}</span><span>{{ String(lot.expireAt).slice(0, 10) }} 到期</span>
        </div>
      </div>
    </section>

    <section v-else class="asset-overview asset-overview--token">
      <div class="asset-overview-top"><span class="asset-icon"><Coins :size="19" aria-hidden="true" /></span><span>可用数权</span></div>
      <div class="asset-balance">{{ money(token?.total) }}</div>
      <div class="asset-overview-foot">
        <span>累计获得 {{ money(token?.granted) }}</span><span>转入 {{ money(token?.transferIn) }}</span><span>转出 {{ money(token?.transferOut) }}</span>
      </div>
      <p class="asset-description">数权为奖金分配中的记账部分，可会员间互转、即时到账；不提现、不消费。</p>
      <button v-if="store.has('token.transfer') && store.profile?.transferPasswordSet" type="button" class="asset-transfer-button" @click="error = ''; showTransfer = true">发起互转</button>
      <button v-else-if="store.has('token.transfer')" type="button" class="asset-transfer-button" @click="router.push('/security/transfer-password')">设置支付密码</button>
    </section>

    <div v-if="tabs.length" class="asset-section-head">
      <div><h2>{{ tab === 'token' ? '数权明细' : `${assetTitle}流水` }}</h2><p>按发生时间展示账户变动</p></div>
    </div>
    <div v-if="tabs.length && tab === 'token'" class="asset-note">
      <Coins :size="18" aria-hidden="true" /><span>数权由平台按奖金规则记账，可会员间互转（即时到账），不可提现或消费。</span>
    </div>
    <div v-if="tabs.length && txs.length" class="transaction-list">
      <article v-for="tx in txs" :key="tx.id" class="transaction-row">
        <span class="transaction-icon" :class="{ 'transaction-icon--out': Number(tx.changeAmount) < 0 }">
          <ArrowDownLeft v-if="Number(tx.changeAmount) >= 0" :size="17" aria-hidden="true" />
          <ArrowUpRight v-else :size="17" aria-hidden="true" />
        </span>
        <div class="transaction-copy"><strong>{{ txLabel(tx.bizType) }}</strong><span>{{ new Date(tx.createdAt).toLocaleString('zh-CN') }}</span></div>
        <strong class="transaction-amount" :class="{ 'transaction-amount--positive': Number(tx.changeAmount) >= 0 }">
          {{ Number(tx.changeAmount) >= 0 ? '+' : '' }}{{ money(tx.changeAmount) }}
        </strong>
      </article>
    </div>
    <EmptyState v-else-if="tabs.length" title="暂无交易流水" description="账户发生变动后，记录会显示在这里" />

    <template v-if="tabs.length">
      <div class="asset-section-head">
        <div><h2>{{ tab === 'wallet' ? '转账记录' : tab === 'equity' ? '转让记录' : '互转记录' }}</h2><p>{{ tab === 'token' ? '即时到账，无需对方确认' : '发起后需对方 24 小时内确认' }}</p></div>
        <span class="asset-section-count">共 {{ transferTotal }} 笔</span>
      </div>

      <div v-if="transfers.length" class="transaction-list transfer-list">
        <article v-for="tx in transfers" :key="tx.id" class="transaction-row">
          <span class="transaction-icon" :class="{ 'transaction-icon--out': isMe(tx.fromUserId) }">
            <ArrowDownLeft v-if="!isMe(tx.fromUserId)" :size="17" aria-hidden="true" />
            <ArrowUpRight v-else :size="17" aria-hidden="true" />
          </span>
          <div class="transaction-copy">
            <strong>{{ isMe(tx.fromUserId) ? '转出' : '转入' }} · {{ counterpart(tx) }}</strong>
            <span>{{ tx.transferNo }} · {{ new Date(tx.createdAt).toLocaleString('zh-CN') }}</span>
          </div>
          <div class="transfer-side">
            <strong class="transaction-amount" :class="{ 'transaction-amount--positive': !isMe(tx.fromUserId) }">
              {{ isMe(tx.fromUserId) ? '-' : '+' }}{{ money(tx.amount) }}
            </strong>
            <span class="transfer-status" :class="`transfer-status--${tx.status.toLowerCase()}`">
              {{ TRANSFER_STATUS[tx.status] ?? tx.status }}
            </span>
            <button
              v-if="tx.status === 'PENDING' && !isMe(tx.fromUserId)"
              type="button"
              class="transfer-accept"
              :disabled="accepting === String(tx.id)"
              @click="acceptTransfer(tx)"
            >
              {{ accepting === String(tx.id) ? '确认中…' : '确认接收' }}
            </button>
          </div>
        </article>
      </div>
      <EmptyState v-else title="暂无转账记录" description="发起转账或收到他人转账后，记录会显示在这里" />

      <div v-if="transferPages > 1" class="transfer-pager">
        <button type="button" :disabled="transferPage <= 1" @click="loadTransfers(transferPage - 1)">上一页</button>
        <span>{{ transferPage }} / {{ transferPages }}</span>
        <button type="button" :disabled="transferPage >= transferPages" @click="loadTransfers(transferPage + 1)">下一页</button>
      </div>
    </template>

    <p v-if="tabs.length" class="asset-disclaimer">平台资产仅限系统内按业务规则使用，具体规则以平台公示为准。</p>

    <AppModal v-if="store.profile?.transferPasswordSet && (store.has('wallet.transfer') || store.has('equity.transfer') || store.has('token.transfer'))" v-model="showTransfer" eyebrow="资产操作" :title="`发起${tab === 'wallet' ? '转账' : tab === 'equity' ? '转让' : '互转'}`"
      :description="error || (tab === 'token' ? '填写对方手机号与数量，提交后即时到账。' : '填写对方手机号与数量，提交后等待对方确认。')"
      :confirm-loading="busy" :confirm-disabled="!validTransfer" confirm-text="确认发起"
      hint="需验证转账支付密码；数权即时到账，余额与权益值需对方在 24 小时内确认。" @confirm="transfer"
      @cancel="paymentPassword = ''; error = ''">
      <label class="app-field"><span>对方手机号</span><t-input v-model="toPhone" type="tel" placeholder="请输入已实名会员手机号" /></label>
      <label class="app-field"><span>{{ tab === 'wallet' ? '转账金额' : tab === 'equity' ? '转让权益值' : '互转数权' }}</span><t-input v-model="amount" type="number" placeholder="请输入数量" /></label>
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
.asset-section-count { color: var(--muted); font-size: 10px; white-space: nowrap; }
.transfer-side { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.transfer-status { padding: 1px 6px; border-radius: 999px; background: var(--green-soft); color: var(--green); font-size: 9px; font-weight: 600; }
.transfer-status--pending { background: color-mix(in srgb, var(--accent) 12%, var(--surface)); color: var(--accent); }
.transfer-status--completed { background: var(--green-soft); color: var(--green); }
.transfer-status--rejected, .transfer-status--expired { background: color-mix(in srgb, var(--danger) 10%, var(--surface)); color: var(--danger); }
.transfer-accept { min-height: 24px; padding: 0 10px; border: 0; border-radius: 7px; background: var(--brand); color: #fff; font: inherit; font-size: 10px; font-weight: 700; white-space: nowrap; cursor: pointer; }
.transfer-accept:disabled { opacity: .55; cursor: default; }
.transfer-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 12px; color: var(--muted); font-size: 10.5px; }
.transfer-pager button { min-height: 26px; padding: 0 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; font-size: 10.5px; cursor: pointer; }
.transfer-pager button:disabled { opacity: .45; cursor: default; }
.asset-disclaimer { margin: 16px 0 0; color: var(--muted); font-size: 9.5px; line-height: 1.6; text-align: center; }
</style>
