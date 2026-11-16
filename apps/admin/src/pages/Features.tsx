import { useEffect, useState } from 'react';
import { Globe2, Layers3, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { api, put } from '../api';
import type { FeatureFlag } from '../types';
import {
  Badge, Button, Card, CardHeader, Empty, Field, PageHeader, SelectField, Toast,
} from '../components/ui';

const MODULE_NAMES: Record<string, string> = {
  package: '礼包', product: '商城', member: '会员', referral: '推广', team: '团队',
  bonus: '收益', equity: '权益值', wallet: '钱包', token: '数权', rank: '等级',
  notify: '通知', user: '用户',
};
const PLATFORMS = [
  { value: 'h5', label: 'H5 · 已上线' },
  { value: 'app', label: 'APP · 规划中' },
];
const RANKS = ['普通会员', '业务主任', '业务经理', '业务总监', '业务副总', '业务总经理', '业务总裁'];
const FEATURE_COVERAGE: Record<string, { status: string; tone: 'success' | 'warning' | 'info'; surface: string }> = {
  'package.purchase': { status: 'H5 已接入', tone: 'success', surface: '会员端：礼包入口、下单与接口校验' },
  'product.mall': { status: 'H5 已接入', tone: 'success', surface: '会员端：商品列表、详情与下单校验' },
  'member.upgrade': { status: '前台待接入', tone: 'warning', surface: '当前仅订单接口校验，会员端暂无升级入口' },
  'member.repurchase': { status: '前台待接入', tone: 'warning', surface: '当前仅订单接口校验，会员端暂无复购入口' },
  'referral.center': { status: 'H5 已接入', tone: 'success', surface: '会员端：邀请中心与推广码接口' },
  'team.view': { status: 'H5 已接入', tone: 'success', surface: '合伙人端：团队列表与团队结构' },
  'bonus.detail': { status: 'H5 已接入', tone: 'success', surface: '会员端及合伙人端：收益汇总与明细' },
  'equity.account': { status: 'H5 已接入', tone: 'success', surface: '会员端：权益账户、批次与流水' },
  'equity.transfer': { status: 'H5 已接入', tone: 'success', surface: '会员端：权益转让入口与接口校验' },
  'wallet.account': { status: 'H5 已接入', tone: 'success', surface: '会员端：钱包账户与流水' },
  'wallet.transfer': { status: 'H5 已接入', tone: 'success', surface: '会员端：余额转账入口与接口校验' },
  'token.view': { status: 'H5 已接入', tone: 'success', surface: '会员端：数权账户只读展示' },
  'rank.view': { status: 'H5 已接入', tone: 'success', surface: '合伙人端：当前等级、晋升路径与变更记录' },
  'rank.dividend': { status: 'H5 已接入', tone: 'success', surface: '合伙人端：分红池入口与明细接口' },
  'notify.subscribe': { status: '前台待接入', tone: 'warning', surface: '当前 H5 与合伙人端均无订阅消息入口' },
  realname: { status: 'H5 已接入', tone: 'success', surface: '会员端：实名认证表单与提交接口' },
  'customer.service': { status: '前台待接入', tone: 'warning', surface: '当前 H5 与合伙人端均无客服入口' },
  'address.manage': { status: 'H5 已接入', tone: 'success', surface: '会员端：收货地址增删改、默认地址与订单快照' },
  'transfer.password': { status: 'H5 已接入', tone: 'success', surface: '会员端：设置、修改及转账支付密码校验' },
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line-strong'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export function Features() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<FeatureFlag>>>({});
  const [toast, setToast] = useState('');
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');
  const [saving, setSaving] = useState<string | null>(null);

  const notify = (message: string, nextTone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setTone(nextTone);
  };

  const load = () => {
    api<FeatureFlag[]>('/admin/features').then((list) => {
      setFlags(list);
      setDraft(Object.fromEntries(list.map((f) => [f.code, {
        enabled: f.enabled,
        platforms: [...f.platforms],
        minRankLevel: f.minRankLevel,
      }])));
    }).catch((e) => notify(e.message, 'error'));
  };
  useEffect(load, []);

  const dirty = (code: string) => {
    const f = flags.find((x) => x.code === code)!;
    const d = draft[code];
    return d && (d.enabled !== f.enabled || d.minRankLevel !== f.minRankLevel ||
      JSON.stringify(d.platforms) !== JSON.stringify(f.platforms));
  };

  const save = async (code: string) => {
    setSaving(code);
    try {
      const d = draft[code];
      await put(`/admin/features/${code}`, {
        enabled: d.enabled, platforms: d.platforms, minRankLevel: d.minRankLevel,
      });
      notify('已保存并立即生效', 'success');
      load();
    } catch (e: any) {
      notify(e.message ?? '保存失败', 'error');
    } finally {
      setSaving(null);
    }
  };

  const togglePlatform = (code: string, platform: string) => {
    setDraft((prev) => {
      const cur = prev[code]?.platforms ?? [];
      const selected = cur.length === 0 ? PLATFORMS.map((p) => p.value) : cur;
      if (selected.includes(platform) && selected.length === 1) return prev;
      const next = selected.includes(platform) ? selected.filter((p) => p !== platform) : [...selected, platform];
      const normalized = next.length === PLATFORMS.length ? [] : next;
      return { ...prev, [code]: { ...prev[code], platforms: normalized } };
    });
  };

  const changeAll = (enabled: boolean) => {
    setDraft((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, enabled }])));
  };

  const dirtyCount = flags.filter((f) => dirty(f.code)).length;

  return (
    <>
      <PageHeader
        title="功能开关中心"
        description="按实际前台入口配置功能：H5 已上线，APP 处于规划阶段；修改后同步控制会员端、合伙人端与服务端"
        action={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => changeAll(true)}>
              <Globe2 size={14} /> 全部开启
            </Button>
            <Button variant="ghost" size="sm" onClick={load} disabled={dirtyCount === 0}>
              <RotateCcw size={14} /> 重置{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
            </Button>
          </div>
        )}
      />

      <div className="notice notice-info mb-4">
        <ShieldCheck size={16} />
        <div>
          H5 是当前已上线渠道，APP 仅作后续规划；微信、支付宝小程序不在项目渠道范围内。
          平台空数组表示所有支持渠道，等级为最低可见等级。卡片会标明真实前台接入范围；“前台待接入”的开关目前仅用于后台配置或服务端限制。
        </div>
      </div>

      {flags.length === 0 ? (
        <Card><Empty text="暂无功能开关" description="后端初始化后会自动注册可配置的功能模块。" /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flags.map((f) => {
            const d = draft[f.code] ?? {};
            const changed = dirty(f.code);
            const coverage = FEATURE_COVERAGE[f.code] ?? { status: '前台待核对', tone: 'info' as const, surface: '尚未登记对应的前台页面或接口。' };
            return (
              <Card key={f.code} className={changed ? 'ring-1 ring-accent/40' : ''}>
                <CardHeader
                  title={(
                    <span className="flex items-center gap-2">
                      {f.name}
                      <Badge tone="neutral">{MODULE_NAMES[f.module] ?? f.module}</Badge>
                    </span>
                  )}
                  description={<span className="mono text-2xs">{f.code}</span>}
                  action={<Toggle checked={!!d.enabled} label={`切换 ${f.name}`} onChange={() => setDraft((p) => ({ ...p, [f.code]: { ...p[f.code], enabled: !d.enabled } }))} />}
                />
                <div className="space-y-3.5 p-4">
                  <div className="rounded-md border border-line bg-panel px-3 py-2.5">
                    <div className="mb-1.5"><Badge tone={coverage.tone}>{coverage.status}</Badge></div>
                    <p className="m-0 text-2xs leading-relaxed text-ink-3">{coverage.surface}</p>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-2xs text-ink-faint">
                      <Globe2 size={12} /> 开放平台
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {PLATFORMS.map((p) => {
                        const selected = d.platforms ?? [];
                        const active = selected.length === 0 || selected.includes(p.value);
                        const selectedCount = selected.length === 0 ? PLATFORMS.length : selected.length;
                        const locked = active && selectedCount === 1;
                        return (
                          <button
                            key={p.value}
                            type="button"
                            disabled={locked}
                            aria-pressed={active}
                            title={locked ? '至少保留一个开放平台' : undefined}
                            onClick={() => togglePlatform(f.code, p.value)}
                            className={`rounded-md border px-2 py-1 text-2xs transition ${
                              active
                                ? 'border-accent bg-accent-soft text-accent-ink'
                                : 'border-line bg-panel text-ink-3 hover:border-line-strong hover:text-ink'
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Field label={<span className="flex items-center gap-1.5"><Layers3 size={12} /> 最低可见等级</span>}>
                    <SelectField
                      className="h-8 text-xs"
                      ariaLabel={`${f.name} 最低可见等级`}
                      value={String(d.minRankLevel ?? 0)}
                      onChange={(e) => setDraft((p) => ({ ...p, [f.code]: { ...p[f.code], minRankLevel: Number(e.target.value) } }))}
                      options={RANKS.map((name, lv) => ({ value: String(lv), label: name }))}
                    />
                  </Field>
                </div>
                <div className="border-t border-line p-3">
                  <Button
                    variant={changed ? 'primary' : 'secondary'}
                    size="sm"
                    block
                    disabled={!changed || saving === f.code}
                    onClick={() => save(f.code)}
                  >
                    <Save size={13} /> {saving === f.code ? '保存中…' : changed ? '保存并生效' : '未修改'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {toast && <Toast message={toast} tone={tone} onClose={() => setToast('')} />}
    </>
  );
}
