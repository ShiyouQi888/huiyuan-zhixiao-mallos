import { useCallback, useEffect, useState } from 'react';
import { HandCoins, RefreshCw } from 'lucide-react';
import { api, fmtDate, fmtMoney } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, ErrorBlock, TableSkeleton,
} from '../components/ui';

function todayText(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Dividends() {
  const [date, setDate] = useState('');
  const [pools, setPools] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [rankNames, setRankNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = date ? `?date=${encodeURIComponent(date)}` : '';
      const [poolList, recordList, rankList] = await Promise.all([
        api<any>(`/admin/dividend/pools${query}`),
        api<any>(`/admin/dividends${query}`),
        api<any>('/admin/ranks'),
      ]);
      setPools(Array.isArray(poolList) ? poolList : (poolList.list ?? []));
      setRecords(Array.isArray(recordList) ? recordList : (recordList.list ?? []));
      const names: Record<number, string> = {};
      for (const rank of Array.isArray(rankList) ? rankList : (rankList.list ?? [])) {
        names[Number(rank.id)] = rank.name;
      }
      setRankNames(names);
    } catch (e) {
      setError(e instanceof Error ? e.message : '分红数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          结算日期
          <input
            type="date"
            className="input w-auto py-1.5 text-xs"
            value={date}
            max={todayText()}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        {date && <Button size="sm" variant="ghost" onClick={() => setDate('')}>清除筛选</Button>}
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> 刷新
        </Button>
      </div>

      {error ? <ErrorBlock text={`加载失败：${error}`} action={<Button size="sm" onClick={() => void load()}>重试</Button>} /> : null}

      <div className="space-y-4">
        <Card className="overflow-hidden">
          <CardHeader
            title="分红池快照"
            description="各等级当日业绩、池金额与人均分红（来自每日结算快照）"
            icon={<HandCoins size={15} />}
          />
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : pools.length === 0 ? (
            <Empty text="暂无分红池快照" description="每日结算后会按等级生成快照。" icon={<HandCoins size={18} />} />
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="th">结算日</th>
                    <th className="th">等级</th>
                    <th className="th text-center">人数</th>
                    <th className="th text-right">总业绩</th>
                    <th className="th text-right">池金额</th>
                    <th className="th text-right">人均分红</th>
                  </tr>
                </thead>
                <tbody>
                  {pools.map((pool) => (
                    <tr key={pool.id} className="admin-row">
                      <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(pool.statDate)}</td>
                      <td className="td"><Badge tone="brand">{pool.rank?.name ?? rankNames[Number(pool.rankId)] ?? `Lv.${pool.rankId}`}</Badge></td>
                      <td className="td num text-center">{pool.userCount}</td>
                      <td className="td num text-right">{fmtMoney(pool.totalPerformance)}</td>
                      <td className="td num text-right text-accent-ink">{fmtMoney(pool.poolAmount)}</td>
                      <td className="td num text-right">{fmtMoney(pool.perCapita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="分红记录" description="实际发放给高层级会员的分红明细" />
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : records.length === 0 ? (
            <Empty text="暂无分红记录" description="达到副总及以上等级的会员可参与全网分红。" icon={<HandCoins size={18} />} />
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="th">结算日</th>
                    <th className="th">收益人</th>
                    <th className="th">等级</th>
                    <th className="th text-right">分红金额</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id} className="admin-row">
                      <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(record.statDate)}</td>
                      <td className="td">
                        <div className="cell-strong">{record.user?.nickname ?? '—'}</div>
                        {record.user?.phone && <div className="cell-muted mono">{record.user.phone}</div>}
                      </td>
                      <td className="td"><Badge tone="info">{rankNames[Number(record.rankId)] ?? `Lv.${record.rankId}`}</Badge></td>
                      <td className="td num text-right font-medium text-accent-ink">{fmtMoney(record.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
