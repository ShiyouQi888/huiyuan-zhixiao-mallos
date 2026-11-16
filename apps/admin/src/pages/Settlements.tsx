import { Button, Badge, Card, PageHeader, Toast } from '../components/ui';
import { useEffect, useState } from 'react';
import { CheckCircle2, Play, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { api, fmtDate, getAdminRole, post } from '../api';
import type { SettleBatch } from '../types';

export function Settlements() {
  const role = getAdminRole();
  const canRunSettlement = role === 'SUPER_ADMIN' || role === 'OPERATOR';
  const canReconcile = role === 'SUPER_ADMIN' || role === 'FINANCE';
  const [batches, setBatches] = useState<SettleBatch[]>([]);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [recon, setRecon] = useState<any>(null);

  const load = () => {
    api<{ list: SettleBatch[] }>('/admin/settlements/daily')
      .then((r) => setBatches(r.list ?? []))
      .catch((e) => setToast(e.message));
  };
  useEffect(load, []);

  const run = async () => {
    setBusy('settle');
    try {
      const r = await post('/admin/settlements/daily/rerun', { date });
      setToast(`日结完成：${r.statDate}，共 11 步`);
      load();
    } catch (e: any) {
      setToast(e.message ?? '日结失败');
    } finally {
      setBusy('');
    }
  };

  const reconcile = async () => {
    setBusy('recon');
    try {
      const r = await post('/admin/settlements/reconcile', { date });
      setRecon(r);
      setToast(r.allPassed ? '对账通过：5 项恒等式全部成立' : '对账存在差异，请检查');
    } catch (e: any) {
      setToast(e.message ?? '对账失败');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <PageHeader title="日结与对账" description="每日 02:00 自动执行 11 步结算；支持手工重跑与账务恒等式校验" />

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
              <Play size={17} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">日结与对账操作</h2>
              <p className="mt-0.5 text-xs text-slate-500">日结重跑需复核；对账用于核验账务恒等式</p>
            </div>
          </div>

          <label className="mb-2 block text-xs text-slate-400">结算日期</label>
          <input type="date" className="input mb-4" value={date} onChange={(e) => setDate(e.target.value)} />
          {canRunSettlement && <Button className="btn-primary h-10 w-full" onClick={run} disabled={busy === 'settle'}>
            <RefreshCw size={15} className={busy === 'settle' ? 'animate-spin' : ''} />
            {busy === 'settle' ? '结算中…' : '执行日结'}
          </Button>}

          {canRunSettlement && canReconcile && <div className="my-5 border-t border-white/[0.06]" />}

          {canReconcile && <Button className="btn-ghost h-10 w-full" onClick={reconcile} disabled={busy === 'recon'}>
            <ShieldCheck size={15} /> {busy === 'recon' ? '对账中…' : '执行账务对账'}
          </Button>}

          {recon && (
            <div className="mt-4 space-y-2">
              {recon.checks.map((c: any) => (
                <div key={c.name} className="flex items-center gap-2 rounded-lg bg-surface-900 px-3 py-2 text-xs">
                  {c.ok ? <CheckCircle2 size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-rose-400" />}
                  <span className={c.ok ? 'text-slate-400' : 'text-rose-300'}>{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden lg:col-span-3">
          <div className="border-b border-white/[0.06] px-6 py-5">
            <h2 className="text-sm font-semibold text-white">日结批次记录</h2>
            <p className="mt-1 text-xs text-slate-500">断点续跑：崩溃后从记录的 step 继续</p>
          </div>
          {batches.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-600">暂无日结记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    <th className="th">结算日</th>
                    <th className="th">进度</th>
                    <th className="th">状态</th>
                    <th className="th">开始时间</th>
                    <th className="th">完成时间</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className="border-b border-white/[0.03]">
                      <td className="td font-mono text-xs text-slate-300">{b.statDate?.slice?.(0, 10) ?? String(b.statDate).slice(0, 10)}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, b.step / 11 * 100)}%` }} />
                          </div>
                          <span className="text-xs text-slate-500">{b.step}/11</span>
                        </div>
                      </td>
                      <td className="td">
                        <Badge tone={b.status === 'DONE' ? 'green' : b.status === 'FAILED' ? 'red' : 'amber'}>
                          {b.status === 'DONE' ? '已完成' : b.status === 'FAILED' ? '失败' : '运行中'}
                        </Badge>
                      </td>
                      <td className="td text-xs text-slate-500">{fmtDate(b.startedAt)}</td>
                      <td className="td text-xs text-slate-500">{b.finishedAt ? fmtDate(b.finishedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
