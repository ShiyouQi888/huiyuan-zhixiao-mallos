import { Button, Badge, Card, PageHeader, Toast } from '../components/ui';
import { useEffect, useState } from 'react';
import { Globe2, Layers3, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { api, put } from '../api';
import type { FeatureFlag } from '../types';

const MODULE_NAMES: Record<string, string> = {
  package: '礼包', product: '商城', member: '会员', referral: '推广', team: '团队',
  bonus: '收益', equity: '权益值', wallet: '钱包', token: '数权', rank: '等级',
  notify: '通知', user: '用户',
};
const PLATFORMS = [
  { value: 'h5', label: 'H5' },
  { value: 'weixin', label: '微信小程序' },
  { value: 'alipay', label: '支付宝' },
  { value: 'app', label: 'App' },
];
const RANKS = ['普通会员', '业务主任', '业务经理', '业务总监', '业务副总', '业务总经理', '业务总裁'];

export function Features() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<FeatureFlag>>>({});
  const [toast, setToast] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const load = () => {
    api<FeatureFlag[]>('/admin/features').then((list) => {
      setFlags(list);
      setDraft(Object.fromEntries(list.map((f) => [f.code, {
        enabled: f.enabled,
        platforms: [...f.platforms],
        minRankLevel: f.minRankLevel,
      }])));
    }).catch((e) => setToast(e.message));
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
      setToast('已保存并立即生效');
      load();
    } catch (e: any) {
      setToast(e.message ?? '保存失败');
    } finally {
      setSaving(null);
    }
  };

  const togglePlatform = (code: string, platform: string) => {
    setDraft((prev) => {
      const cur = prev[code]?.platforms ?? [];
      const next = cur.includes(platform) ? cur.filter((p) => p !== platform) : [...cur, platform];
      return { ...prev, [code]: { ...prev[code], platforms: next } };
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
        description="三层控制：全局开关 · 分端开放 · 分级可见。修改后立即生效，后端接口同步拦截"
        action={
          <div className="flex gap-2">
            <Button className="btn-ghost" onClick={() => changeAll(true)}><Globe2 size={15} /> 全部开启</Button>
            <Button className="btn-ghost" onClick={load} disabled={dirtyCount === 0}>
              <RotateCcw size={15} /> 重置 {dirtyCount > 0 && `(${dirtyCount})`}
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-indigo-500/15 bg-indigo-500/[0.05] p-4 text-xs leading-relaxed text-indigo-200/70">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-indigo-400" />
        <div>
          前端按开关渲染菜单与页面入口；后端每个写接口二次校验，防止绕过前端直接调用。
          平台的空数组表示全端开放；等级为「最低可见等级」。
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {flags.map((f) => {
          const d = draft[f.code] ?? {};
          const changed = dirty(f.code);
          return (
            <Card key={f.code} className={`p-5 transition ${changed ? 'ring-1 ring-accent/40' : ''}`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-white">{f.name}</h3>
                    <Badge tone="slate">{MODULE_NAMES[f.module] ?? f.module}</Badge>
                  </div>
                  <div className="mt-1.5 font-mono text-[11px] text-slate-600">{f.code}</div>
                </div>
                <Button
                  onClick={() => setDraft((p) => ({ ...p, [f.code]: { ...p[f.code], enabled: !d.enabled } }))}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${d.enabled ? 'bg-accent' : 'bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${d.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </Button>
              </div>

              <div className="space-y-3.5">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500"><Globe2 size={12} /> 开放平台</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PLATFORMS.map((p) => {
                      const active = (d.platforms ?? []).includes(p.value);
                      return (
                        <Button
                          key={p.value}
                          onClick={() => togglePlatform(f.code, p.value)}
                          className={`rounded-md px-2 py-1 text-[11px] transition
                            ${active ? 'bg-accent/15 text-indigo-300 ring-1 ring-inset ring-accent/30' : 'bg-surface-900 text-slate-600 hover:text-slate-300'}`}
                        >
                          {p.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] text-slate-500"><Layers3 size={12} /> 最低可见等级</div>
                  <select
                    className="input h-9 py-0 text-xs"
                    value={d.minRankLevel ?? 0}
                    onChange={(e) => setDraft((p) => ({ ...p, [f.code]: { ...p[f.code], minRankLevel: Number(e.target.value) } }))}
                  >
                    {RANKS.map((name, lv) => <option key={lv} value={lv}>{name}</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-4 border-t border-white/[0.06] pt-3">
                <Button
                  className={`btn-primary h-8 w-full text-xs ${!changed ? 'opacity-40' : ''}`}
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

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
