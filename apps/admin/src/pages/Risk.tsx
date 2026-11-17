import { useEffect, useState } from 'react';
import { CheckCircle2, MonitorSmartphone, ShieldAlert } from 'lucide-react';
import { api, fmtDate, post } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, PageHeader, StatCard, TableSkeleton, Tabs, Toast, useConfirm,
} from '../components/ui';

const EVENT_NAMES: Record<string, string> = {
  SAME_DEVICE_TRANSFER: '同设备互转',
  TRANSFER_REVIEW: '转账待审核',
  HIGH_FREQUENCY: '高频操作',
};

export function Risk() {
  const [tab, setTab] = useState<'events' | 'devices'>('events');
  const [events, setEvents] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');
  const { confirm, confirmNode } = useConfirm();

  const notify = (message: string, nextTone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setTone(nextTone);
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api<any[]>('/admin/risk/events').then((r) => setEvents(r as any)).catch((e) => notify(e.message, 'error')),
      api<any[]>('/admin/risk/devices').then(setDevices).catch(() => {}),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handle = async (event: any) => {
    const agreed = await confirm({
      title: '标记该风控事件为已处理？',
      description: `${EVENT_NAMES[event.eventType] ?? event.eventType} · ${event.user?.nickname ?? '未知会员'}。标记后不再出现在待处理列表。`,
      confirmText: '标记已处理',
      confirmationText: `处理风控事件 ${event.id}`,
    });
    if (!agreed) return;
    try {
      await post(`/admin/risk/events/${event.id}/handle`, { handled: true });
      notify('已标记为处理完成', 'success');
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    }
  };

  const pending = events.filter((e) => !e.handled);
  const highRisk = events.filter((e) => Number(e.score) >= 100);
  const multiDevices = devices.filter((d) => Number(d._count?._all ?? 0) > 1);

  return (
    <>
      <PageHeader
        title="风控中心"
        description="同设备互转、集中转入、新号大额等风控事件与转账审核"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="待处理事件" value={String(pending.length)} icon={<ShieldAlert size={17} />} accent="warning" trend={`累计 ${events.length} 条风控事件`} />
        <StatCard label="高风险事件" value={String(highRisk.length)} icon={<ShieldAlert size={17} />} accent="danger" trend="风险分 ≥ 100" />
        <StatCard label="多账号设备" value={String(multiDevices.length)} icon={<MonitorSmartphone size={17} />} accent="info" trend={`共 ${devices.length} 个设备指纹`} />
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(value) => setTab(value as 'events' | 'devices')}
        items={[
          { value: 'events', label: '风控事件', count: events.length },
          { value: 'devices', label: '多账号设备', count: devices.length },
        ]}
      />

      <Card className="overflow-hidden">
        {tab === 'events' ? (
          <>
            <CardHeader title="风控事件列表" description="按时间倒序，未处理事件优先关注" />
            {loading ? <TableSkeleton rows={7} cols={7} /> : events.length === 0 ? (
              <Empty text="暂无风控事件" description="系统检测到异常行为时会自动生成风控事件。" icon={<ShieldAlert size={18} />} />
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="th">事件类型</th>
                      <th className="th">会员</th>
                      <th className="th text-right">风险分</th>
                      <th className="th">详情</th>
                      <th className="th">状态</th>
                      <th className="th">时间</th>
                      <th className="th text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id} className="admin-row">
                        <td className="td">
                          <Badge tone={e.eventType === 'SAME_DEVICE_TRANSFER' ? 'danger' : 'warning'}>
                            {EVENT_NAMES[e.eventType] ?? e.eventType}
                          </Badge>
                        </td>
                        <td className="td">
                          <div className="cell-strong">{e.user?.nickname ?? '—'}</div>
                          <div className="cell-muted mono">{e.user?.phone ?? '—'}</div>
                        </td>
                        <td className="td text-right">
                          <span className={`num text-xs font-medium ${Number(e.score) >= 100 ? 'text-danger' : 'text-warning'}`}>
                            {e.score}
                          </span>
                        </td>
                        <td className="td">
                          <span className="mono block max-w-[260px] truncate text-2xs text-ink-muted" title={JSON.stringify(e.detail)}>
                            {JSON.stringify(e.detail ?? {}).slice(0, 80)}
                          </span>
                        </td>
                        <td className="td">
                          <Badge tone={e.handled ? 'success' : 'warning'}>{e.handled ? '已处理' : '待处理'}</Badge>
                        </td>
                        <td className="td text-xs text-ink-muted">{fmtDate(e.createdAt)}</td>
                        <td className="td text-right">
                          {!e.handled && (
                            <Button size="xs" variant="ghost" onClick={() => handle(e)}>
                              <CheckCircle2 size={13} /> 处理
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <CardHeader title="多账号设备" description="同一设备指纹关联多个账号时疑似同人多号" />
            {loading ? <TableSkeleton rows={5} cols={3} /> : devices.length === 0 ? (
              <Empty text="暂无设备数据" description="会员登录后会记录设备指纹。" icon={<MonitorSmartphone size={18} />} />
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="th">设备指纹</th>
                      <th className="th text-right">关联账号数</th>
                      <th className="th">风险判断</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d, i) => {
                      const count = Number(d._count?._all ?? 0);
                      return (
                        <tr key={`${d.deviceFingerprint}-${i}`} className="admin-row">
                          <td className="td mono text-xs text-ink-2">{d.deviceFingerprint}</td>
                          <td className="td num text-right">{count}</td>
                          <td className="td">
                            {count > 1 ? <Badge tone="danger">同人多号嫌疑</Badge> : <Badge tone="success">正常</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {confirmNode}
      {toast && <Toast message={toast} tone={tone} onClose={() => setToast('')} />}
    </>
  );
}
