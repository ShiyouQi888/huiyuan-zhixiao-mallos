<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, post } from '../api';
import { Toast } from './_toast';
import PageHeading from '../components/PageHeading.vue';
import EmptyState from '../components/EmptyState.vue';
import AppModal from '../components/AppModal.vue';
import { Check, ChevronDown, ChevronRight, MapPin, Pencil, Plus, Star, Trash2, X } from 'lucide-vue-next';
import regionTree from '@province-city-china/level/level.min.json';

interface RegionOption {
  c: string;
  n: string;
  y?: string;
  a?: string;
  d?: RegionOption[];
}

interface Address {
  id: string | number;
  receiver: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

type AddressDraft = Omit<Address, 'id'>;
const addresses = ref<Address[]>([]);
const loading = ref(true);
const saving = ref(false);
const pageError = ref('');
const editorOpen = ref(false);
const deleteOpen = ref(false);
const editingId = ref<string | number | null>(null);
const deletingAddress = ref<Address | null>(null);
const draft = ref<AddressDraft>(emptyDraft());
const regionCode = ref<string | number>();
const regionPickerOpen = ref(false);
const regionPickerPath = ref<RegionOption[]>([]);
const selectedRegionCode = ref('');
const regionOptions = regionTree as RegionOption[];
const citiesWithoutCounty = new Set(['东莞市', '中山市', '儋州市', '嘉峪关市']);
const regionText = computed(() => [draft.value.province, draft.value.city, draft.value.district].filter(Boolean).join(' / '));
const phoneValid = computed(() => /^1[3-9]\d{9}$/.test(draft.value.phone));
const phoneInvalid = computed(() => draft.value.phone.length > 0 && !phoneValid.value);
const validDraft = computed(() => Boolean(
  draft.value.receiver.trim() && phoneValid.value && draft.value.province.trim() &&
  draft.value.city.trim() && regionCode.value !== undefined &&
  (draft.value.district.trim() || citiesWithoutCounty.has(draft.value.city)) && draft.value.detail.trim(),
));
const regionPickerOptions = computed(() => regionPickerPath.value.at(-1)?.d ?? regionOptions);
const regionPickerSteps = computed(() => {
  const first = regionPickerPath.value[0];
  const directDistricts = regionPickerPath.value.length === 1 && Boolean(first?.d?.[0]?.a);
  return directDistricts ? ['省份', '区县'] : ['省份', '城市', '区县'];
});
const regionPickerStepTitle = computed(() => regionPickerSteps.value[regionPickerPath.value.length] ?? '区县');

function emptyDraft(): AddressDraft {
  return { receiver: '', phone: '', province: '', city: '', district: '', detail: '', isDefault: false };
}

async function load() {
  loading.value = true;
  pageError.value = '';
  try {
    addresses.value = await api<Address[]>('/me/addresses');
  } catch (error: any) {
    pageError.value = error.message ?? '收货地址加载失败';
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  draft.value = { ...emptyDraft(), isDefault: addresses.value.length === 0 };
  regionCode.value = undefined;
  editorOpen.value = true;
}

function openEdit(address: Address) {
  editingId.value = address.id;
  draft.value = {
    receiver: address.receiver,
    phone: address.phone,
    province: address.province,
    city: address.city,
    district: address.district,
    detail: address.detail,
    isDefault: address.isDefault,
  };
  regionCode.value = findRegionCode(address);
  editorOpen.value = true;
}

function openRegionPicker() {
  regionPickerPath.value = [];
  selectedRegionCode.value = '';
  if (regionCode.value !== undefined) {
    const selectedPath = findRegionPath(String(regionCode.value));
    if (selectedPath?.length) {
      regionPickerPath.value = selectedPath.slice(0, -1);
      selectedRegionCode.value = selectedPath[selectedPath.length - 1].c;
    }
  }
  regionPickerOpen.value = true;
}

function findRegionCode(address: Address): string | undefined {
  const province = regionOptions.find((item) => item.n === address.province);
  if (!province) return undefined;
  for (const child of province.d ?? []) {
    if (child.n === address.city) {
      const district = child.d?.find((item) => item.n === address.district);
      if (district) return district.c;
      if (!child.d?.length) return child.c;
    }
    if (child.n === address.district) return child.c;
  }
  return undefined;
}

function findRegionPath(code: string, options = regionOptions, parentPath: RegionOption[] = []): RegionOption[] | undefined {
  for (const option of options) {
    const path = [...parentPath, option];
    if (option.c === code) return path;
    const childPath = findRegionPath(code, option.d ?? [], path);
    if (childPath) return childPath;
  }
  return undefined;
}

function applyRegion(value: string | number, selectedOptions: RegionOption[]) {
  if (!selectedOptions.length) return;
  const province = selectedOptions[0];
  const second = selectedOptions[1];
  const district = selectedOptions[2];
  draft.value.province = province.n;
  if (!second) return;
  if (district) {
    draft.value.city = second.n;
    draft.value.district = district.n;
  } else if (second.a) {
    // 直辖市直接由省级行政区进入区县，城市字段保存为直辖市名称。
    draft.value.city = province.n;
    draft.value.district = second.n;
  } else {
    // 东莞、中山等不设县级行政区的地级市可直接选择城市。
    draft.value.city = second.n;
    draft.value.district = '';
  }
  regionCode.value = value;
}

function chooseRegion(option: RegionOption) {
  const nextPath = [...regionPickerPath.value, option];
  if (option.d?.length) {
    regionPickerPath.value = nextPath;
    selectedRegionCode.value = '';
    return;
  }
  selectedRegionCode.value = option.c;
  applyRegion(option.c, nextPath);
  regionPickerOpen.value = false;
}

function goToRegionStep(index: number) {
  regionPickerPath.value = regionPickerPath.value.slice(0, index);
  selectedRegionCode.value = '';
}

function closeRegionPicker() {
  regionPickerOpen.value = false;
}

function normalizePhone(event: Event) {
  const input = event.target as HTMLInputElement;
  draft.value.phone = input.value.replace(/\D/g, '').slice(0, 11);
  input.value = draft.value.phone;
}

async function save() {
  if (!validDraft.value || saving.value) return;
  saving.value = true;
  try {
    if (editingId.value !== null) {
      await api(`/me/addresses/${editingId.value}`, { method: 'PUT', body: draft.value });
      Toast('收货地址已更新', 'success');
    } else {
      await post('/me/addresses', draft.value);
      Toast('收货地址已保存', 'success');
    }
    editorOpen.value = false;
    await load();
  } catch (error: any) {
    Toast(error.message ?? '地址保存失败', 'danger');
  } finally {
    saving.value = false;
  }
}

async function setDefault(address: Address) {
  if (address.isDefault) return;
  try {
    await api(`/me/addresses/${address.id}`, {
      method: 'PUT',
      body: { ...address, isDefault: true },
    });
    Toast('默认地址已更新', 'success');
    await load();
  } catch (error: any) {
    Toast(error.message ?? '默认地址更新失败', 'danger');
  }
}

function askDelete(address: Address) {
  deletingAddress.value = address;
  deleteOpen.value = true;
}

async function removeAddress() {
  if (!deletingAddress.value) return;
  try {
    await api(`/me/addresses/${deletingAddress.value.id}`, { method: 'DELETE' });
    Toast('收货地址已删除', 'success');
    deleteOpen.value = false;
    deletingAddress.value = null;
    await load();
  } catch (error: any) {
    Toast(error.message ?? '地址删除失败', 'danger');
  }
}

onMounted(load);
</script>

<template>
  <main class="page address-page">
    <PageHeading back eyebrow="账户设置" title="收货地址" subtitle="管理实物商品配送地址，下单时可选择使用" />

    <div v-if="pageError" class="address-error" role="alert">{{ pageError }}</div>
    <div v-if="loading" class="address-loading" aria-label="地址加载中">
      <div v-for="index in 2" :key="index" class="skeleton-card address-skeleton"><div class="skeleton-lines"><span class="skeleton-block" /><span class="skeleton-block" /><span class="skeleton-block" /></div></div>
    </div>

    <template v-else-if="addresses.length">
      <section class="address-list" aria-label="已保存的收货地址">
        <article v-for="address in addresses" :key="address.id" class="address-card" :class="{ 'address-card--default': address.isDefault }">
          <div class="address-card-head">
            <div class="address-recipient"><strong>{{ address.receiver }}</strong><span>{{ address.phone }}</span></div>
            <span v-if="address.isDefault" class="address-default-tag"><Star :size="12" fill="currentColor" aria-hidden="true" />默认地址</span>
          </div>
          <div class="address-detail"><MapPin :size="15" aria-hidden="true" />
            <span>{{ address.province }}{{ address.city }}{{ address.district }}{{ address.detail }}</span>
          </div>
          <div class="address-actions">
            <button v-if="!address.isDefault" type="button" @click="setDefault(address)"><Check :size="14" aria-hidden="true" />设为默认</button>
            <button type="button" @click="openEdit(address)"><Pencil :size="14" aria-hidden="true" />编辑</button>
            <button type="button" class="address-action-danger" @click="askDelete(address)"><Trash2 :size="14" aria-hidden="true" />删除</button>
          </div>
        </article>
      </section>
    </template>
    <EmptyState v-else-if="!pageError" title="还没有收货地址" description="添加地址后，下单实物商品时即可选择配送信息。" />

    <button type="button" class="btn btn-primary address-add-button" @click="openCreate">
      <Plus :size="17" aria-hidden="true" />新增收货地址
    </button>

    <AppModal v-model="editorOpen" eyebrow="地址簿" :title="editingId === null ? '新增收货地址' : '编辑收货地址'"
      description="请填写完整信息，地址仅用于您的订单配送。" :confirm-loading="saving"
      :confirm-disabled="!validDraft" :confirm-text="saving ? '保存中…' : '保存地址'" @confirm="save">
      <div class="address-form-grid">
        <label class="app-field"><span>收货人</span><input v-model="draft.receiver" class="input" maxlength="64" autocomplete="name" placeholder="请输入收货人姓名" /></label>
        <label class="app-field"><span>联系电话</span><input v-model="draft.phone" class="input" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" :aria-invalid="phoneInvalid" placeholder="请输入 11 位大陆手机号" @input="normalizePhone" /><small v-if="phoneInvalid" class="address-field-error">请输入有效的 11 位大陆手机号</small></label>
        <div class="app-field address-form-full"><span>所在地区</span>
          <button type="button" class="input address-region-trigger" :class="{ 'address-region-trigger--empty': !regionText }" @click="openRegionPicker">
            <span>{{ regionText || '请选择省、市、区县' }}</span><ChevronDown :size="16" aria-hidden="true" />
          </button>
        </div>
        <label class="app-field address-form-full"><span>详细地址</span><input v-model="draft.detail" class="input" maxlength="512" autocomplete="street-address" placeholder="街道、楼栋、单元及门牌号" /></label>
        <label class="address-default-control"><input v-model="draft.isDefault" type="checkbox" /><span>设为默认收货地址</span></label>
      </div>
    </AppModal>

    <Teleport to="body">
      <div v-if="regionPickerOpen" class="region-picker-overlay" @click.self="closeRegionPicker">
        <section class="region-picker-sheet" role="dialog" aria-modal="true" aria-label="选择所在地区">
          <header class="region-picker-head">
            <div><span>收货地址</span><h2>选择所在地区</h2></div>
            <button type="button" aria-label="关闭地区选择" @click="closeRegionPicker"><X :size="19" /></button>
          </header>
          <nav class="region-picker-steps" aria-label="地区选择层级">
            <button v-for="(step, index) in regionPickerSteps" :key="step" type="button"
              :class="{ active: index === regionPickerPath.length, complete: index < regionPickerPath.length }"
              :aria-current="index === regionPickerPath.length ? 'step' : undefined"
              @click="goToRegionStep(index)">
              {{ regionPickerPath[index]?.n ?? step }}
            </button>
          </nav>
          <div class="region-picker-list" role="listbox" :aria-label="`选择${regionPickerStepTitle}`">
            <button v-for="option in regionPickerOptions" :key="option.c" type="button" role="option"
              class="region-picker-option" :class="{ selected: selectedRegionCode === option.c }"
              :aria-selected="selectedRegionCode === option.c" @click="chooseRegion(option)">
              <span>{{ option.n }}</span>
              <Check v-if="selectedRegionCode === option.c" :size="17" aria-hidden="true" />
              <ChevronRight v-else-if="option.d?.length" :size="16" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </Teleport>

    <AppModal v-model="deleteOpen" eyebrow="删除确认" title="删除收货地址？" alert
      :description="deletingAddress ? `${deletingAddress.receiver} · ${deletingAddress.phone}` : ''"
      confirm-text="确认删除" hint="删除后无法恢复；若该地址为默认地址，会自动切换为其他地址。"
      @confirm="removeAddress">
      <div class="app-modal-note">该操作不会影响已提交订单中保存的配送地址。</div>
    </AppModal>
  </main>
</template>

<style scoped>
.address-page { padding-bottom: calc(94px + env(safe-area-inset-bottom)); }
.address-list { display: grid; gap: 11px; }
.address-card { overflow: hidden; padding: 15px 15px 11px; border: 1px solid var(--line); border-radius: 15px; background: var(--surface); box-shadow: var(--shadow-card); }
.address-card--default { border-color: color-mix(in srgb, var(--brand) 32%, var(--line)); }
.address-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.address-recipient { display: flex; min-width: 0; align-items: center; gap: 11px; }
.address-recipient strong { color: var(--text); font-size: 14px; font-weight: 700; }
.address-recipient span { color: var(--muted); font-size: 12px; }
.address-default-tag { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 999px; background: var(--brand-soft); color: var(--brand); font-size: 10px; font-weight: 650; }
.address-detail { display: flex; align-items: flex-start; gap: 7px; margin-top: 13px; color: var(--text-2); font-size: 12px; line-height: 1.65; }
.address-detail svg { flex: 0 0 auto; margin-top: 2px; color: var(--muted); }
.address-actions { display: flex; justify-content: flex-end; gap: 15px; margin-top: 13px; padding-top: 10px; border-top: 1px solid var(--line); }
.address-actions button { display: inline-flex; align-items: center; gap: 5px; padding: 3px 0; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer; }
.address-actions button:hover { color: var(--brand); }
.address-actions .address-action-danger:hover { color: var(--danger); }
.address-add-button { position: fixed; z-index: 5; right: max(16px, calc((100vw - 430px) / 2)); bottom: calc(80px + env(safe-area-inset-bottom)); left: max(16px, calc((100vw - 430px) / 2)); width: auto; box-shadow: 0 8px 24px color-mix(in srgb, var(--brand) 24%, transparent); }
.address-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 12px; }
.address-form-full { grid-column: 1 / -1; }
.address-region-trigger { display: flex; align-items: center; justify-content: space-between; gap: 10px; text-align: left; cursor: pointer; }
.address-region-trigger span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.address-region-trigger svg { flex: 0 0 auto; color: var(--muted); }
.address-region-trigger--empty { color: var(--muted); }
.address-field-error { color: var(--danger); font-size: 10px; }
.region-picker-overlay { position: fixed; inset: 0; z-index: 120; display: flex; align-items: flex-end; justify-content: center; background: color-mix(in srgb, var(--scrim) 72%, transparent); }
.region-picker-sheet { display: flex; width: min(100vw, var(--shell-w)); max-height: min(76dvh, 640px); flex-direction: column; overflow: hidden; padding-bottom: env(safe-area-inset-bottom); border: 1px solid var(--line); border-bottom: 0; border-radius: 20px 20px 0 0; background: var(--surface); box-shadow: var(--shadow-modal); }
.region-picker-head { display: flex; min-height: 68px; align-items: center; justify-content: space-between; padding: 13px 18px 10px; border-bottom: 1px solid var(--line); }
.region-picker-head > div { display: grid; gap: 3px; }
.region-picker-head > div > span { color: var(--brand); font-size: 9px; font-weight: 700; letter-spacing: .08em; }
.region-picker-head h2 { margin: 0; color: var(--text); font-size: 15px; font-weight: 700; }
.region-picker-head > button { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); color: var(--muted); cursor: pointer; }
.region-picker-steps { display: flex; min-height: 48px; align-items: stretch; gap: 18px; overflow-x: auto; padding: 0 18px; border-bottom: 1px solid var(--line); scrollbar-width: none; }
.region-picker-steps::-webkit-scrollbar { display: none; }
.region-picker-steps button { position: relative; flex: 0 0 auto; padding: 0; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer; }
.region-picker-steps button.active { color: var(--brand); font-weight: 700; }
.region-picker-steps button.complete { color: var(--text-2); }
.region-picker-steps button.active::after { position: absolute; right: 0; bottom: 0; left: 0; height: 2px; border-radius: 2px 2px 0 0; background: var(--brand); content: ''; }
.region-picker-list { min-height: 190px; overflow-y: auto; overscroll-behavior: contain; padding: 4px 10px max(12px, env(safe-area-inset-bottom)); }
.region-picker-option { display: flex; width: 100%; min-height: 46px; align-items: center; justify-content: space-between; gap: 12px; padding: 0 10px; border: 0; border-bottom: 1px solid var(--line); background: transparent; color: var(--text-2); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.region-picker-option:last-child { border-bottom: 0; }
.region-picker-option.selected { color: var(--brand); font-weight: 650; }
.region-picker-option svg { flex: 0 0 auto; color: var(--brand); }
.address-default-control { display: inline-flex; grid-column: 1 / -1; min-height: 42px; align-items: center; gap: 9px; color: var(--text-2); font-size: 12px; }
.address-default-control input { width: 16px; height: 16px; accent-color: var(--brand); }
.address-error { margin-bottom: 12px; padding: 11px 12px; border: 1px solid color-mix(in srgb, var(--danger) 24%, var(--line)); border-radius: 11px; color: var(--danger); font-size: 12px; }
.address-loading { display: grid; gap: 11px; }
.address-skeleton .skeleton-lines { gap: 10px; padding: 15px; }
.address-skeleton .skeleton-lines span { height: 13px; }
@media (max-width: 380px) { .address-form-grid { grid-template-columns: 1fr; } .address-form-full, .address-default-control { grid-column: auto; } }
</style>
