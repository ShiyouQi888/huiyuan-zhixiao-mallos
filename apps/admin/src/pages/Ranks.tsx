import { Button, TextInput, Badge, Card, PageHeader, Toast } from '../components/ui';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api, fmtDate, fmtMoney, put } from '../api';

export function Ranks() {
  const [tab, setTab] = useState<'config' | 'logs'>('config');
  const [ranks, setRanks] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    api<any[]>('/admin/ranks').then(setRanks).catch((e) => setToast(e.message));
    api<any[]>('/admin/ranks/logs').then((r) => setLogs(r as any)).catch(() => {});
  };
  useEffect(load, []);

  const save = async () => {
    try {
      await put(`/admin/ranks/${editing.id}`, {
        name: editing.name, threshold: Number(editing.threshold),
        teamRate: Number(editing.teamRate), poolRate: Number(editing.poolRate),
      });
      setToast('等级配置已保存，下次日结生效');
      setEditing(null); load();
    } catch (e: any) { setToast(e.message); }
  };

  return (
    <>
      <PageHeader title="等级管理" description="职级门槛与费率配置（修改后下次日结生效）、历史升级记录" />

      <div className="mb-5 flex gap-2">
        <Button className={tab === 'config' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('config')}>等级配置</Button>
        <Button className={tab === 'logs' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('logs')}>升级记录</Button>
      </div>

      {tab === 'config' ? (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-white/[0.04]">
              <th className="th">等级</th><th className="th">名称</th><th className="th">累计业绩门槛</th>
              <th className="th">团队奖费率</th><th className="th">分红池比例</th><th className="th text-right">操作</th>
            </tr></thead>
            <tbody>
              {ranks.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="td"><Badge tone={r.level > 0 ? 'indigo' : 'slate'}>Lv.{r.level}</Badge></td>
                  <td className="td text-white">{r.name}</td>
                  <td className="td">{fmtMoney(r.threshold)}</td>
                  <td className="td accent">{(Number(r.teamRate) * 100).toFixed(1)}%</td>
                  <td className="td green">{(Number(r.poolRate) * 100).toFixed(1)}%</td>
                  <td className="td text-right">
                    <Button className="text-indigo-400 hover:text-indigo-300 text-xs" onClick={() => setEditing({ ...r })}>编辑</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {logs.length === 0 ? <div className="py-16 text-center text-sm text-slate-600">暂无升级记录</div> : (
            <table className="w-full">
              <thead><tr className="border-b border-white/[0.04]">
                <th className="th">会员</th><th className="th">等级变化</th><th className="th">触发时累计业绩</th><th className="th">类型</th><th className="th">时间</th>
              </tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-white/[0.03]">
                    <td className="td">{l.user?.nickname ?? '—'}</td>
                    <td className="td"><Badge tone="slate">Lv.{l.fromLevel}</Badge> → <Badge tone="indigo">Lv.{l.toLevel}</Badge></td>
                    <td className="td">{fmtMoney(l.totalPerformance)}</td>
                    <td className="td"><Badge tone={l.triggerType === 'AUTO' ? 'green' : 'amber'}>{l.triggerType === 'AUTO' ? '自动' : '手工'}</Badge></td>
                    <td className="td text-xs text-slate-500">{fmtDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setEditing(null)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-5 text-base font-semibold text-white">编辑等级 · {editing.name}</h3>
            <div className="space-y-4">
              <div><label className="mb-1.5 block text-xs text-slate-400">名称</label>
                <TextInput className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-xs text-slate-400">累计业绩门槛（元）</label>
                <input className="input" type="number" value={editing.threshold} onChange={(e) => setEditing({ ...editing, threshold: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1.5 block text-xs text-slate-400">团队奖费率（0-1）</label>
                  <input className="input" type="number" step="0.01" value={editing.teamRate} onChange={(e) => setEditing({ ...editing, teamRate: e.target.value })} /></div>
                <div><label className="mb-1.5 block text-xs text-slate-400">分红池比例（0-1）</label>
                  <input className="input" type="number" step="0.01" value={editing.poolRate} onChange={(e) => setEditing({ ...editing, poolRate: e.target.value })} /></div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button className="btn-ghost" onClick={() => setEditing(null)}>取消</Button>
              <Button className="btn-primary" onClick={save}><Save size={15} /> 保存</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
