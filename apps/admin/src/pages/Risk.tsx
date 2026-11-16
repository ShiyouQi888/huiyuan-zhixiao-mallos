import { Button, Badge, Card, PageHeader, Toast } from '../components/ui';
import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api, fmtDate, fmtMoney, post } from '../api';

const EVENT_NAMES: Record<string, string> = {
  SAME_DEVICE_TRANSFER: '同设备互转',
  TRANSFER_REVIEW: '转账待审核',
  HIGH_FREQUENCY: '高频操作',
};

export function Risk() {
  const [tab, setTab] = useState<'events' | 'devices'>('events');
  const [events, setEvents] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [toast, setToast] = useState('');

  const load = () => {
    api<any[]>('/admin/risk/events').then((r) => setEvents(r as any)).catch((e) => setToast(e.message));
    api<any[]>('/admin/risk/devices').then(setDevices).catch(() => {});
  };
  useEffect(load, []);

  const handle = async (id: string) => {
    try {
      await post(`/admin/risk/events/${id}/handle`, { handled: true });
      setToast('已标记为处理完成'); load();
    } catch (e: any) { setToast(e.message); }
  };

  return (
    <>
      <PageHeader title="风控中心" description="同设备互转、集中转入、新号大额等风控事件与转账审核" />

      <div className="mb-5 flex gap-2">
        <Button className={tab === 'events' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('events')}>风控事件</Button>
        <Button className={tab === 'devices' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('devices')}>多账号设备</Button>
      </div>

      <Card className="overflow-hidden">
        {tab === 'events' ? (
          events.length === 0 ? <div className="py-16 text-center text-sm text-slate-600">暂无风控事件</div> : (
            <table className="w-full">
              <thead><tr className="border-b border-white/[0.04]">
                <th className="th">事件类型</th><th className="th">会员</th><th className="th">风险分</th><th className="th">详情</th><th className="th">状态</th><th className="th">时间</th><th className="th text-right">操作</th>
              </tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-b border-white/[0.03]">
                    <td className="td"><Badge tone={e.eventType === 'SAME_DEVICE_TRANSFER' ? 'red' : 'amber'}>{EVENT_NAMES[e.eventType] ?? e.eventType}</Badge></td>
                    <td className="td">{e.user?.nickname ?? '—'}<div className="text-[11px] text-slate-600">{e.user?.phone}</div></td>
                    <td className="td"><span className={e.score >= 100 ? 'text-rose-400' : 'text-amber-400'}>{e.score}</span></td>
                    <td className="td text-xs text-slate-500">{JSON.stringify(e.detail).slice(0, 60)}</td>
                    <td className="td"><Badge tone={e.handled ? 'green' : 'amber'}>{e.handled ? '已处理' : '待处理'}</Badge></td>
                    <td className="td text-xs text-slate-500">{fmtDate(e.createdAt)}</td>
                    <td className="td text-right">
                      {!e.handled && <Button className="text-xs text-indigo-400 hover:text-indigo-300" onClick={() => handle(e.id)}><CheckCircle2 size={14} className="inline" /> 处理</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          devices.length === 0 ? <div className="py-16 text-center text-sm text-slate-600">暂无设备数据</div> : (
            <table className="w-full">
              <thead><tr className="border-b border-white/[0.04]">
                <th className="th">设备指纹</th><th className="th">关联账号数</th><th className="th">风险判断</th>
              </tr></thead>
              <tbody>
                {devices.map((d, i) => (
                  <tr key={i} className="border-b border-white/[0.03]">
                    <td className="td font-mono text-xs">{d.deviceFingerprint}</td>
                    <td className="td">{d._count._all}</td>
                    <td className="td">{d._count._all > 1 ? <Badge tone="red">同人多号嫌疑</Badge> : <Badge tone="green">正常</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </Card>
    </>
  );
}
