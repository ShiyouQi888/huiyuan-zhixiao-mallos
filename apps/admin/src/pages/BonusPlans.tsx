import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, RefreshCw } from 'lucide-react';
import { api, fmtDate, fmtMoney } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, ErrorBlock, Meter, Pagination, TableSkeleton,
} from '../components/ui';

const PAGE_SIZE = 20;

const STATUS_META: Record<string, { label: string; tone: 'brand' | 'success' | 'warning' | 'info' | 'neutral' }> = {
  PENDING: { label: '待释放', tone: 'neutral' },
  RUNNING: { label: '释放中', tone: 'brand' },
  COMPLETED: { label: '已释放完', tone: 'success' },
  PAUSED: { label: '已暂停', tone: 'warning' },
};

export function BonusPlans() {
  const [plans, setPlans] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      const result = await api<any>(`/admin/bonus/plans?${params.toString()}`);
      setPlans(Array.isArray(result) ? result : (result.list ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : '直推奖计划加载失败');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="直推奖计划"
        description="按订单生成的分期释放计划，每期到账金额与进度"
        icon={<CalendarClock size={15} />}
        action={(
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} /> 刷新
          </Button>
        )}
      />

      {loading ? (
        <TableSkeleton rows={8} cols={7} />
      ) : error ? (
        <ErrorBlock text={`加载失败：${error}`} action={<Button size="sm" onClick={() => void load()}>重试</Button>} />
      ) : plans.length === 0 ? (
        <Empty text="暂无直推奖计划" description="会员购买礼包后会自动生成直推奖分期计划。" icon={<CalendarClock size={18} />} />
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="th">收益人</th>
                <th className="th">订单号</th>
                <th className="th text-right">订单金额</th>
                <th className="th text-right">每期金额</th>
                <th className="th text-center">期数</th>
                <th className="th w-[160px]">释放进度</th>
                <th className="th">状态</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const total = Number(plan.totalAmount ?? 0);
                const released = Number(plan.releasedAmount ?? 0);
                const percent = total > 0 ? Math.min(100, Math.round((released / total) * 100)) : 0;
                const meta = STATUS_META[plan.status] ?? { label: plan.status, tone: 'neutral' as const };
                return (
                  <tr key={plan.id} className="admin-row">
                    <td className="td">
                      <div className="cell-strong">{plan.beneficiary?.nickname ?? '—'}</div>
                      {plan.beneficiary?.phone && <div className="cell-muted mono">{plan.beneficiary.phone}</div>}
                    </td>
                    <td className="td mono text-xs text-ink-muted">{plan.order?.orderNo ?? '—'}</td>
                    <td className="td num text-right">{fmtMoney(plan.order?.amount ?? plan.totalAmount)}</td>
                    <td className="td num text-right">{fmtMoney(plan.dailyAmount)}</td>
                    <td className="td num text-center">{plan.periods}</td>
                    <td className="td">
                      <div className="flex items-center gap-2">
                        <Meter value={percent} className="w-20" />
                        <span className="num text-2xs text-ink-faint">{released}/{total}</span>
                      </div>
                    </td>
                    <td className="td"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} hasNext={plans.length >= PAGE_SIZE} onChange={setPage} />
    </Card>
  );
}
