import { useCallback, useEffect, useState } from 'react';
import { Save, SlidersHorizontal } from 'lucide-react';
import { api, put } from '../api';
import {
  Button, Card, CardHeader, ErrorBlock, Field, TableSkeleton, Toast,
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
  { key: 'bonus.token_ratio', label: '数权分成比例', scope: '奖金拆分', kind: 'percent', max: 100, hint: '奖金计入数权的比例' },
  { key: 'bonus.direct_periods', label: '直推奖释放期数', scope: '直推奖', kind: 'number', max: 365, hint: '分多少期释放，1-365 的整数' },
  { key: 'bonus.team_exclude_ratio', label: '团队奖剔除最大线阈值', scope: '团队奖', kind: 'percent', max: 100, hint: '直接下线≥2 条时剔除业绩最大的一条线（其领导奖/平级奖一并剔除）；0=无条件剔除，>0 则仅当占比超过该值才剔除' },
];

const EMPTY = Object.fromEntries(FIELDS.map((field) => [field.key, '']));

export function BonusSettings() {
  const [values, setValues] = useState<Record<string, string>>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await api<any[]>('/admin/configs');
      const map: Record<string, number> = {};
      for (const item of Array.isArray(list) ? list : []) {
        if (item?.group === 'bonus') map[item.key] = Number(item.value);
      }
      setValues(
        Object.fromEntries(FIELDS.map((field) => [
          field.key,
          map[field.key] === undefined || Number.isNaN(map[field.key])
            ? ''
            : String(field.kind === 'percent' ? Number((map[field.key] * 100).toFixed(2)) : map[field.key]),
        ])),
      );
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
    if (Math.abs(cash + token - 100) > 1e-6) return '钱包与数权分成比例之和必须等于 100%';
    return '';
  };

  const save = async () => {
    const message = validate();
    if (message) {
      setToast(message);
      return;
    }
    const payload: Record<string, number> = {};
    for (const field of FIELDS) payload[field.key] = Number(values[field.key].trim());

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
          </div>
        )}

        <div className={`border-t border-line px-4 py-2.5 text-2xs leading-5 ${error ? 'text-ink-faint' : splitValid ? 'text-success' : 'text-warning'}`}>
          {error
            ? '仅超级管理员可配置奖金参数。'
            : splitValid
              ? `当前拆分：钱包 ${cash}% + 数权 ${token}% = 100%，校验通过。`
              : `钱包与数权分成之和须为 100%（当前 ${Number.isFinite(cash) ? cash : 0}% + ${Number.isFinite(token) ? token : 0}%）。`}
        </div>
      </Card>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
