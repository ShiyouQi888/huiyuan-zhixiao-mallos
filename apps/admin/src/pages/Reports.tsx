import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, fmtMoney, getAdminRole } from '../api';
import { Card, PageHeader } from '../components/ui';

const BONUS_NAMES: Record<number, string> = { 1: '直推', 2: '团队', 3: '平级', 4: '领导', 5: '分红', 6: '调整' };

export function Reports() {
  const supportView = getAdminRole() === 'SUPPORT';
  const [issuance, setIssuance] = useState<any>(null);
  const [bonus, setBonus] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);

  useEffect(() => {
    if (!supportView) {
      api<any>('/admin/reports/issuance').then(setIssuance).catch(() => {});
      api<any[]>('/admin/reports/bonus').then(setBonus).catch(() => {});
      api<any[]>('/admin/reports/hierarchy').then(setHierarchy).catch(() => {});
    }
    api<any>('/admin/reports/performance?days=14').then((r) => setPerformance((r as any).list ?? r ?? [])).catch(() => {});
  }, [supportView]);

  const bonusData = bonus.map((b) => ({ name: BONUS_NAMES[b.type] ?? `类型${b.type}`, amount: Number(b.amount) }));
  const perfData = performance.slice(-14).map((p: any) => ({
    date: String(p.statDate).slice(5, 10),
    performance: Number(p.performance ?? p._sum?.ownAmount ?? p.ownAmount ?? 0),
  }));

  return (
    <>
      <PageHeader title="数据报表" description={supportView ? '查看近 14 日平台业绩趋势' : '业绩趋势、奖金构成、层级分布与虚拟货币发行总账'} />

      {/* 发行总账 */}
      {!supportView && <>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: '权益值', data: issuance?.equity, color: 'accent' },
          { title: '钱包余额', data: issuance?.wallet, color: 'green' },
        ].map((item) => (
          <Card key={item.title} className="p-5">
            <div className="mb-4 text-sm font-semibold text-white">{item.title} · 发行总账</div>
            <div className="space-y-2.5 text-xs">
              {[['累计发行', item.data?.issued], ['流通中', item.data?.circulating], ['已消费', item.data?.consumed], ['平台沉淀', item.data?.sunk]].map(([label, value]) => (
                <div key={label as string} className="flex justify-between">
                  <span className="text-slate-500">{label}</span>
                  <span className={item.color === 'green' ? 'text-emerald-400' : 'text-indigo-300'}>{fmtMoney(value)}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
        <Card className="p-5">
          <div className="mb-4 text-sm font-semibold text-white">数权 · 发行总账</div>
          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">累计记账</span><span className="text-white">{fmtMoney(issuance?.token?.issued)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">可流转</span><span className="text-slate-400">否</span></div>
            <div className="mt-4 text-[11px] leading-relaxed text-slate-600">数权为奖金 30% 部分，仅记账，不参与消费与转让。</div>
          </div>
        </Card>
      </div>
      </>}

      {/* 图表 */}
      <div className={`mt-5 grid gap-5 ${supportView ? '' : 'lg:grid-cols-2'}`}>
        <Card className={`p-6 ${supportView ? 'lg:col-span-2' : ''}`}>
          <h2 className="mb-5 text-sm font-semibold text-white">近 14 日平台业绩趋势</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perfData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--solar-line)" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--solar-card)', color: 'var(--solar-text)', border: '1px solid var(--solar-line)', borderRadius: 12, fontSize: 12 }} itemStyle={{ color: 'var(--solar-text)' }} labelStyle={{ color: 'var(--solar-muted)' }} />
                <Bar dataKey="performance" name="平台业绩" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {!supportView && <Card className="p-6">
          <h2 className="mb-5 text-sm font-semibold text-white">奖金构成（30 日）</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bonusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--solar-line)" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: 'var(--solar-card)', color: 'var(--solar-text)', border: '1px solid var(--solar-line)', borderRadius: 12, fontSize: 12 }} itemStyle={{ color: 'var(--solar-text)' }} labelStyle={{ color: 'var(--solar-muted)' }} />
                <Bar dataKey="amount" name="奖金金额" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>}
      </div>

      {!supportView && <Card className="mt-5 p-6">
        <h2 className="mb-5 text-sm font-semibold text-white">团队层级分布</h2>
        <div className="flex flex-wrap gap-4">
          {hierarchy.map((h) => (
            <div key={h.depth} className="rounded-xl border border-white/[0.06] bg-surface-900 px-5 py-3">
              <div className="text-xs text-slate-500">第 {h.depth} 层</div>
              <div className="mt-1 text-lg font-semibold text-white">{h._count._all} <span className="text-xs font-normal text-slate-500">人</span></div>
            </div>
          ))}
        </div>
      </Card>}
    </>
  );
}
