import { useEffect, useState } from 'react';
import { CheckCircle2, Play, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { api, fmtDate, getAdminRole, post } from '../api';
import type { SettleBatch } from '../types';
import {
  Badge, Button, Card, CardHeader, Empty, Field, Meter, PageHeader, TableSkeleton, Toast, useConfirm,
} from '../components/ui';

const STATUS_LABELS: Record<string, string> = { DONE: '已完成', FAILED: '失败', RUNNING: '运行中' };
const STATUS_TONES: Record<string, 'success' | 'danger' | 'warning'> = {
  DONE: 'success', FAILED: 'danger', RUNNING: 'warning',
};

export function Settlements() {
  const role = getAdminRole();
  const canRunSettlement = role === 'SUPER_ADMIN' || role === 'OPERATOR';
  const canReconcile = role === 'SUPER_ADMIN' || role === 'FINANCE';
  const [batches, setBatches] = useState<SettleBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');
  const [recon, setRecon] = useState<any>(null);
  const { confirm, confirmNode } = useConfirm();

  const notify = (message: string, nextTone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setTone(nextTone);
  };

  const load = () => {
    setLoading(true);
    api<{ list: SettleBatch[] }>('/admin/settlements/daily')
      .then((r) => setBatches(r.list ?? []))
      .catch((e) => notify(e.message, 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const run = async () => {
    const agreed = await confirm({
      title: `重跑 ${date} 的日结？`,
      description: '重跑会重新执行 11 步结算流程，已完成的步骤可能被覆盖。请确认该日数据无人工调整后再执行。',
      confirmText: '确认重跑',
      tone: 'danger',
    });
    if (!agreed) return;
    setBusy('settle');
    try {
      const r = await post('/admin/settlements/daily/rerun', { date });
      notify(`日结完成：${r.statDate}，共 11 步`, 'success');
      load();
    } catch (e: any) {
      notify(e.message ?? '日结失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const reconcile = async () => {
    setBusy('recon');
    try {
      const r = await post('/admin/settlements/reconcile', { date });
      setRecon(r);
      notify(r.allPassed ? '对账通过：5 项恒等式全部成立' : '对账存在差异，请检查', r.allPassed ? 'success' : 'error');
    } catch (e: any) {
      notify(e.message ?? '对账失败', 'error');
    } finally {
      setBusy('');
    }
  };

  const doneCount = batches.filter((b) => b.status === 'DONE').length;

  return (
    <>
      <PageHeader
        title="日结与对账"
        description="每日 02:00 自动执行 11 步结算；支持手工重跑与账务恒等式校验"
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader
            title="日结与对账操作"
            description="日结重跑需复核；对账用于核验账务恒等式"
            icon={<Play size={15} />}
          />
          <div className="space-y-4 p-4">
            <Field label="结算日期" hint="默认取前一日，可选择历史日期补跑">
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <div className="space-y-2">
              {canRunSettlement && (
                <Button variant="primary" block disabled={busy === 'settle'} onClick={run}>
                  <RefreshCw size={14} className={busy === 'settle' ? 'animate-spin' : ''} />
                  {busy === 'settle' ? '结算中…' : '执行日结'}
                </Button>
              )}
              {canReconcile && (
                <Button variant="secondary" block disabled={busy === 'recon'} onClick={reconcile}>
                  <ShieldCheck size={14} /> {busy === 'recon' ? '对账中…' : '执行账务对账'}
                </Button>
              )}
              {!canRunSettlement && !canReconcile && (
                <div className="notice notice-warning">当前角色无日结与对账权限，请联系超级管理员或财务。</div>
              )}
            </div>

            {recon && (
              <div className="subtle-panel p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-2">对账结果</span>
                  <Badge tone={recon.allPassed ? 'success' : 'danger'}>
                    {recon.allPassed ? '全部通过' : '存在差异'}
                  </Badge>
                </div>
                <div className="space-y-1.5">
                  {(recon.checks ?? []).map((c: any) => (
                    <div key={c.name} className="flex items-center gap-2 text-xs">
                      {c.ok
                        ? <CheckCircle2 size={14} className="shrink-0 text-success" />
                        : <XCircle size={14} className="shrink-0 text-danger" />}
                      <span className={c.ok ? 'text-ink-3' : 'font-medium text-danger'}>{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader
            title="日结批次记录"
            description="断点续跑：崩溃后从记录的 step 继续"
            action={<Badge tone="neutral">已完成 {doneCount} / {batches.length}</Badge>}
          />
          {loading ? <TableSkeleton rows={6} cols={5} /> : batches.length === 0 ? (
            <Empty text="暂无日结记录" description="执行一次日结后，批次进度会显示在这里。" icon={<Play size={18} />} />
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="th">结算日</th>
                    <th className="th">进度</th>
                    <th className="th">状态</th>
                    <th className="th">开始时间</th>
                    <th className="th">完成时间</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => {
                    const dateText = b.statDate?.slice?.(0, 10) ?? String(b.statDate).slice(0, 10);
                    return (
                      <tr key={b.id} className="admin-row">
                        <td className="td mono text-xs text-ink-2">{dateText}</td>
                        <td className="td">
                          <div className="flex items-center gap-2">
                            <Meter
                              className="w-16"
                              value={b.step}
                              max={11}
                              tone={b.status === 'FAILED' ? 'danger' : b.status === 'DONE' ? 'success' : 'brand'}
                            />
                            <span className="num text-xs text-ink-muted">{b.step}/11</span>
                          </div>
                        </td>
                        <td className="td">
                          <Badge tone={STATUS_TONES[b.status] ?? 'neutral'}>{STATUS_LABELS[b.status] ?? b.status}</Badge>
                        </td>
                        <td className="td text-xs text-ink-muted">{fmtDate(b.startedAt)}</td>
                        <td className="td text-xs text-ink-muted">{b.finishedAt ? fmtDate(b.finishedAt) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {confirmNode}
      {toast && <Toast message={toast} tone={tone} onClose={() => setToast('')} />}
    </>
  );
}
