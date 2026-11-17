import { useCallback, useEffect, useState } from 'react';
import { Package, Save, SlidersHorizontal } from 'lucide-react';
import { api, put } from '../api';
import {
  Button, Card, CardHeader, ErrorBlock, Field, TableSkeleton, Toast, useConfirm,
} from '../components/ui';

type Kind = 'percent' | 'number';

interface FieldMeta {
  key: string;
  label: string;
  scope: string;
  kind: Kind;
  max: number;
  hint: string;
}

/** 五条收益线涉及的奖金参数，与后端 configs 表 bonus.* 一一对应 */
const FIELDS: FieldMeta[] = [
  { key: 'bonus.reward_rate', label: '直推奖比例', scope: '新购 / 升级', kind: 'percent', max: 100, hint: '被推者礼包价的百分比' },
  { key: 'bonus.repurchase_rate', label: '复消直推奖比例', scope: '复消订单', kind: 'percent', max: 100, hint: '复消订单金额的百分比' },
  { key: 'bonus.peer_rate', label: '平级奖比例', scope: '下级团队奖', kind: 'percent', max: 100, hint: '下级当日团队奖的百分比' },
  { key: 'bonus.leader_rate', label: '领导奖比例', scope: '下级团队奖', kind: 'percent', max: 100, hint: '下级当日团队奖的百分比' },
  { key: 'bonus.cash_ratio', label: '钱包分成比例', scope: '奖金拆分', kind: 'percent', max: 100, hint: '奖金进入钱包余额的比例' },
  { key: 'bonus.token_ratio', label: '太阳值分成比例', scope: '奖金拆分', kind: 'percent', max: 100, hint: '奖金计入太阳值的比例' },
  { key: 'bonus.direct_periods', label: '直推奖释放期数', scope: '直推奖', kind: 'number', max: 365, hint: '分多少期释放，1-365 的整数' },
  { key: 'bonus.team_exclude_ratio', label: '最大推广线剔除阈值', scope: '团队奖', kind: 'percent', max: 100, hint: '按每位会员自己的伞下计算；最大直推线占比超过此值时才剔除。0 表示符合条件即剔除' },
];

const EMPTY = Object.fromEntries(FIELDS.map((field) => [field.key, '']));

interface PackageDraft {
  id: number;
  name: string;
  level: number;
  directRewardRate: string;
  repurchaseRewardRate: string;
  directReleaseDays: string;
}

const percentValue = (value: unknown): string => {
  const number = Number(value);
  return Number.isFinite(number) ? String(Number((number * 100).toFixed(2))) : '';
};

export function BonusSettings() {
  const [values, setValues] = useState<Record<string, string>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [packages, setPackages] = useState<PackageDraft[]>([]);
  const [savingPackage, setSavingPackage] = useState<number | null>(null);
  const [globalDefaults, setGlobalDefaults] = useState({ directRate: '100', repurchaseRate: '10', releaseDays: '20' });
  const [teamExcludeEnabled, setTeamExcludeEnabled] = useState(true);
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, packageList] = await Promise.all([
        api<any[]>('/admin/configs'),
        api<any[]>('/admin/packages'),
      ]);
      const map: Record<string, number> = {};
      let excludeEnabled = true;
      for (const item of Array.isArray(list) ? list : []) {
        if (item?.group !== 'bonus') continue;
        if (item.key === 'bonus.team_exclude_enabled') {
          excludeEnabled = item.value === true;
        } else {
          map[item.key] = Number(item.value);
        }
      }
      setTeamExcludeEnabled(excludeEnabled);
      setValues(
        Object.fromEntries(FIELDS.map((field) => [
          field.key,
          map[field.key] === undefined || Number.isNaN(map[field.key])
            ? ''
            : String(field.kind === 'percent' ? Number((map[field.key] * 100).toFixed(2)) : map[field.key]),
        ])),
      );
      setGlobalDefaults({
        directRate: map['bonus.reward_rate'] === undefined ? '100' : percentValue(map['bonus.reward_rate']),
        repurchaseRate: map['bonus.repurchase_rate'] === undefined ? '10' : percentValue(map['bonus.repurchase_rate']),
        releaseDays: map['bonus.direct_periods'] === undefined ? '20' : String(map['bonus.direct_periods']),
      });
      setPackages((Array.isArray(packageList) ? packageList : []).map((item) => ({
        id: Number(item.id),
        name: String(item.name ?? `档位 ${item.level}`),
        level: Number(item.level),
        directRewardRate: item.directRewardRate == null ? '' : percentValue(item.directRewardRate),
        repurchaseRewardRate: item.repurchaseRewardRate == null ? '' : percentValue(item.repurchaseRewardRate),
        directReleaseDays: item.directReleaseDays == null ? '' : String(item.directReleaseDays),
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : '奖金参数加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const validate = (): string => {
    for (const field of FIELDS) {
      const raw = values[field.key].trim();
      if (raw === '') return `请填写「${field.label}」`;
      const num = Number(raw);
      if (!Number.isFinite(num)) return `「${field.label}」不是有效数字`;
      if (num < 0 || num > field.max) return `「${field.label}」需在 0-${field.max} 之间`;
      if (field.kind === 'number' && !Number.isInteger(num)) return `「${field.label}」必须是整数`;
    }
    const cash = Number(values['bonus.cash_ratio']);
    const token = Number(values['bonus.token_ratio']);
    if (Math.abs(cash + token - 100) > 1e-6) return '钱包与太阳值分成比例之和必须等于 100%';
    return '';
  };

  const save = async () => {
    const message = validate();
    if (message) {
      setToast(message);
      return;
    }
    const agreed = await confirm({
      title: '确认保存奖金规则？',
      description: `本次会更新全局奖金比例、释放期数和最大推广线规则；启用状态为${teamExcludeEnabled ? '开启' : '关闭'}，阈值为 ${values['bonus.team_exclude_ratio']}%。设置会影响后续奖励计算。`,
      confirmText: '确认保存规则',
      tone: 'danger',
      confirmationText: '保存奖金规则',
    });
    if (!agreed) return;
    const payload: Record<string, number | boolean> = {};
    for (const field of FIELDS) payload[field.key] = Number(values[field.key].trim());
    payload['bonus.team_exclude_enabled'] = teamExcludeEnabled;

    setSaving(true);
    try {
      await put('/admin/bonus/settings', payload);
      setToast('奖金参数已保存并立即生效');
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '奖金参数保存失败');
    } finally {
      setSaving(false);
    }
  };

  const updatePackageDraft = (id: number, key: keyof Pick<PackageDraft, 'directRewardRate' | 'repurchaseRewardRate' | 'directReleaseDays'>, value: string) => {
    setPackages((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  const savePackage = async (item: PackageDraft) => {
    const parsePercent = (raw: string, label: string): number | null => {
      if (!raw.trim()) return null;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error(`${item.name}「${label}」须在 0-100% 之间`);
      return value;
    };
    let directRewardRate: number | null;
    let repurchaseRewardRate: number | null;
    let directReleaseDays: number | null;
    try {
      directRewardRate = parsePercent(item.directRewardRate, '新购/升级直推比例');
      repurchaseRewardRate = parsePercent(item.repurchaseRewardRate, '复消直推比例');
      if (!item.directReleaseDays.trim()) {
        directReleaseDays = null;
      } else {
        directReleaseDays = Number(item.directReleaseDays);
        if (!Number.isInteger(directReleaseDays) || directReleaseDays < 1 || directReleaseDays > 365) {
          throw new Error(`${item.name}「释放天数」须为 1-365 的整数`);
        }
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : '请检查档位参数');
      return;
    }

    const agreed = await confirm({
      title: `确认更新「${item.name}」奖励规则？`,
      description: `新购 / 升级直推比例：${directRewardRate ?? globalDefaults.directRate}%；复消直推比例：${repurchaseRewardRate ?? globalDefaults.repurchaseRate}%；释放期数：${directReleaseDays ?? globalDefaults.releaseDays}。仅影响之后生成的奖励计划。`,
      confirmText: '确认更新档位规则',
      tone: 'danger',
      confirmationText: `更新档位奖励规则 ${item.name}`,
    });
    if (!agreed) return;

    setSavingPackage(item.id);
    try {
      await put(`/admin/packages/${item.id}`, { directRewardRate, repurchaseRewardRate, directReleaseDays });
      setToast(`${item.name}奖励参数已保存，新订单生效`);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '档位奖励参数保存失败');
    } finally {
      setSavingPackage(null);
    }
  };

  const cash = Number(values['bonus.cash_ratio']);
  const token = Number(values['bonus.token_ratio']);
  const splitValid = Number.isFinite(cash) && Number.isFinite(token) && Math.abs(cash + token - 100) <= 1e-6;

  return (
    <>
      <Card>
        <CardHeader
          title="奖金参数设置"
          description="五条收益线的比例、拆分与释放期数；保存后立即生效，并写入审计日志。"
          icon={<SlidersHorizontal size={15} />}
          action={(
            <Button variant="primary" disabled={saving || loading} onClick={() => void save()}>
              <Save size={14} /> {saving ? '保存中…' : '保存设置'}
            </Button>
          )}
        />

        {loading ? (
          <TableSkeleton rows={7} cols={4} />
        ) : error ? (
          <ErrorBlock text={`加载失败：${error}`} action={<Button size="sm" onClick={() => void load()}>重试</Button>} />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <Field key={field.key} label={`${field.label} · ${field.scope}`} hint={field.hint} required>
                <div className="relative">
                  <input
                    className="input pr-9"
                    type="number"
                    min={0}
                    max={field.max}
                    step={field.kind === 'percent' ? 0.01 : 1}
                    value={values[field.key]}
                    onChange={(event) => setValues((prev) => ({ ...prev, [field.key]: event.target.value }))}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-2xs text-ink-faint">
                    {field.kind === 'percent' ? '%' : '期'}
                  </span>
                </div>
              </Field>
            ))}
            <div className="sm:col-span-2 flex items-start justify-between gap-5 rounded-lg border border-line bg-panel p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">启用最大推广线剔除</div>
                <p className="mb-0 mt-1 max-w-3xl text-xs leading-relaxed text-ink-faint">
                  每位会员独立判断自己的直属推广线，至少有两条直属会员线时，剔除当日业绩最大的一条及其团队奖基数；该条直接关系不产生领导奖和平级奖，推广线内部会员仍按各自规则结算。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={teamExcludeEnabled}
                aria-label="启用最大推广线剔除"
                onClick={() => setTeamExcludeEnabled((enabled) => !enabled)}
                className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${teamExcludeEnabled ? 'bg-accent' : 'bg-line-strong'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${teamExcludeEnabled ? 'left-[18px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>
        )}

        <div className={`border-t border-line px-4 py-2.5 text-2xs leading-5 ${error ? 'text-ink-faint' : splitValid ? 'text-success' : 'text-warning'}`}>
          {error
            ? '仅超级管理员可配置奖金参数。'
            : splitValid
              ? `当前拆分：钱包 ${cash}% + 太阳值 ${token}% = 100%，校验通过。`
              : `钱包与太阳值分成之和须为 100%（当前 ${Number.isFinite(cash) ? cash : 0}% + ${Number.isFinite(token) ? token : 0}%）。`}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="按会员档位配置直推奖励"
          description="留空时继承上方全局参数；档位设置仅用于之后生成的奖励计划，不会改动已生成计划。"
          icon={<Package size={15} />}
        />
        {loading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : error ? (
          <ErrorBlock text={`档位加载失败：${error}`} action={<Button size="sm" onClick={() => void load()}>重试</Button>} />
        ) : packages.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-ink-faint">当前没有可配置的会员档位</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-xs text-ink-faint">
                <tr>
                  <th className="px-4 py-3 font-medium">会员档位</th>
                  <th className="px-4 py-3 font-medium">新购 / 升级直推比例</th>
                  <th className="px-4 py-3 font-medium">复消直推比例</th>
                  <th className="px-4 py-3 font-medium">释放天数</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {packages.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">{item.name}</div>
                      <div className="mt-0.5 text-xs text-ink-faint">档位 {item.level}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative max-w-44">
                        <input className="input pr-8" type="number" min={0} max={100} step="0.01" placeholder={`${globalDefaults.directRate}%（全局）`} value={item.directRewardRate} onChange={(event) => updatePackageDraft(item.id, 'directRewardRate', event.target.value)} />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-2xs text-ink-faint">%</span>
                      </div>
                      <div className="mt-1 text-2xs text-ink-faint">生效：{item.directRewardRate !== '' ? item.directRewardRate : globalDefaults.directRate}%</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative max-w-44">
                        <input className="input pr-8" type="number" min={0} max={100} step="0.01" placeholder={`${globalDefaults.repurchaseRate}%（全局）`} value={item.repurchaseRewardRate} onChange={(event) => updatePackageDraft(item.id, 'repurchaseRewardRate', event.target.value)} />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-2xs text-ink-faint">%</span>
                      </div>
                      <div className="mt-1 text-2xs text-ink-faint">生效：{item.repurchaseRewardRate !== '' ? item.repurchaseRewardRate : globalDefaults.repurchaseRate}%</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative max-w-36">
                        <input className="input pr-9" type="number" min={1} max={365} step={1} placeholder={`${globalDefaults.releaseDays} 天（全局）`} value={item.directReleaseDays} onChange={(event) => updatePackageDraft(item.id, 'directReleaseDays', event.target.value)} />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-2xs text-ink-faint">天</span>
                      </div>
                      <div className="mt-1 text-2xs text-ink-faint">生效：{item.directReleaseDays !== '' ? item.directReleaseDays : globalDefaults.releaseDays} 天</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="secondary" disabled={savingPackage !== null} onClick={() => void savePackage(item)}>
                        <Save size={13} /> {savingPackage === item.id ? '保存中…' : '保存'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line px-4 py-2.5 text-xs leading-5 text-ink-faint">
          例如：档位直推比例 100% 表示按对应订单金额计算全额直推奖；释放天数决定该奖励计划拆分释放的期数。
        </div>
      </Card>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      {confirmNode}
    </>
  );
}
