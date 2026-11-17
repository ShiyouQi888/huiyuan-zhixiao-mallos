import { useCallback, useEffect, useState } from 'react';
import { FileClock, ShieldCheck } from 'lucide-react';
import { api, fmtDate } from '../api';
import {
  Badge, Button, Card, CardHeader, Drawer, Empty, ErrorBlock, KeyValue, PageHeader, Pagination,
  Segmented, TableSkeleton,
} from '../components/ui';

const PAGE_SIZE = 20;

const ACTION_NAMES: Record<string, string> = {
  WALLET_ADJUST: '钱包调整', EQUITY_ADJUST: '权益值调整', BONUS_ADJUST: '奖金调整',
  PEER_LOCK: '平级奖锁定', REBIND: '关系换绑', RANK_MANUAL: '手工调级',
  ORDER_DELIVER: '订单交付', TRANSFER_REVIEW: '转账审核', CONFIG_UPDATE: '配置修改',
  SYSTEM_RECONCILIATION_ALERT: '系统对账异常', SYSTEM_SETTLEMENT_ALERT: '日结异常',
  SYSTEM_RECONCILIATION_RESOLVED: '对账异常已恢复',
};

export function Audit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ page: String(page) });
    if (action) query.set('action', action);
    api<any[] | { list: any[] }>(`/admin/audit-logs?${query.toString()}`)
      .then((r) => setLogs(Array.isArray(r) ? r : (r.list ?? [])))
      .catch((e) => setError(e instanceof Error ? e.message : '审计日志加载失败'))
      .finally(() => setLoading(false));
  }, [action, page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader
        title="审计日志"
        description="资金操作与敏感变更全流程留痕，不可篡改；日志只读保留 180 天"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          value={action}
          onChange={setAction}
          items={[
            { value: '', label: '全部' },
            { value: 'ADJUST', label: '调整类' },
            { value: 'PEER_LOCK', label: '平级锁定' },
            { value: 'REBIND', label: '关系换绑' },
            { value: 'RANK_MANUAL', label: '手工调级' },
            { value: 'ORDER_DELIVER', label: '订单交付' },
            { value: 'TRANSFER_REVIEW', label: '转账审核' },
            { value: 'CONFIG_UPDATE', label: '配置修改' },
          ]}
        />
        <span className="ml-auto text-xs text-ink-faint">
          共 <span className="num text-ink-soft">{logs.length}</span> 条记录
        </span>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="操作留痕" description="点击「详情」查看完整变更内容" icon={<ShieldCheck size={15} />} />
        {loading ? <TableSkeleton rows={8} cols={6} /> : error ? (
          <ErrorBlock text={`加载失败：${error}`} action={<Button size="sm" onClick={() => void load()}>重试</Button>} />
        ) : logs.length === 0 ? (
          <Empty text="暂无审计记录" description="调整资金、换绑关系等敏感操作会在此留痕。" icon={<FileClock size={18} />} />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th">ID</th>
                  <th className="th">操作</th>
                  <th className="th">操作人</th>
                  <th className="th">目标</th>
                  <th className="th">变更内容</th>
                  <th className="th">时间</th>
                  <th className="th text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="admin-row">
                    <td className="td mono text-2xs text-ink-faint">#{l.id}</td>
                    <td className="td"><Badge tone="brand">{ACTION_NAMES[l.action] ?? l.action}</Badge></td>
                    <td className="td">
                      <div className="text-xs text-ink">{l.operatorType}</div>
                      <div className="cell-muted mono">ID {l.operatorId ?? '—'}</div>
                    </td>
                    <td className="td text-xs text-ink-muted">
                      {l.targetType} <span className="mono text-ink-faint">{l.targetId ?? ''}</span>
                    </td>
                    <td className="td">
                      <span className="mono block max-w-[280px] truncate text-2xs text-ink-muted">
                        {JSON.stringify(l.after ?? l.before ?? {})}
                      </span>
                    </td>
                    <td className="td text-xs text-ink-muted">{fmtDate(l.createdAt)}</td>
                    <td className="td text-right">
                      <Button size="xs" variant="ghost" onClick={() => setDetail(l)}>详情</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!error && <Pagination page={page} pageSize={PAGE_SIZE} hasNext={logs.length >= PAGE_SIZE} onChange={setPage} />}
      </Card>

      {detail && (
        <Drawer
          onClose={() => setDetail(null)}
          title={`审计详情 · #${detail.id}`}
          description={`${ACTION_NAMES[detail.action] ?? detail.action} · ${fmtDate(detail.createdAt)}`}
          width={640}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>关闭</Button>}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <KeyValue label="操作人" value={`${detail.operatorType}（ID ${detail.operatorId ?? '—'}）`} />
              <KeyValue label="操作时间" value={fmtDate(detail.createdAt)} />
              <KeyValue label="目标类型" value={detail.targetType ?? '—'} />
              <KeyValue label="目标 ID" value={detail.targetId ?? '—'} mono />
            </div>
            <div>
              <div className="field-label">变更前</div>
              <pre className="subtle-panel mono mt-1.5 max-h-64 overflow-auto p-3 text-2xs leading-5 text-ink-2">
                {JSON.stringify(detail.before ?? null, null, 2)}
              </pre>
            </div>
            <div>
              <div className="field-label">变更后</div>
              <pre className="subtle-panel mono mt-1.5 max-h-64 overflow-auto p-3 text-2xs leading-5 text-ink-2">
                {JSON.stringify(detail.after ?? null, null, 2)}
              </pre>
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}
