import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, Coins, Layers, TrendingUp, Wallet } from 'lucide-react';
import { api, fmtMoney, getAdminRole } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, ErrorBlock, PageHeader, StatCard, TableSkeleton,
} from '../components/ui';

const BONUS_NAMES: Record<number, string> = { 1: '直推', 2: '团队', 3: '平级', 4: '领导', 5: '分红', 6: '调整' };

const compact = (value: number) => {
  if (Math.abs(value) >= 100000000) return `${(value / 100000000).toFixed(1)}亿`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万`;
  return String(value);
};

const formatPv = (value: unknown) => `${Number(value ?? 0).toLocaleString('zh-CN')} PV`;

function ChartTooltip({ active, payload, label, unit = '', format = 'money' }: any) {
  if (!active || !payload?.length) return null;
  const value = format === 'pv' ? Number(payload[0].value).toLocaleString('zh-CN') : fmtMoney(payload[0].value);
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-pop">
      <div className="mb-1 text-2xs text-ink-faint">{label}</div>
      <div className="num font-medium text-ink">
        {value}<span className="ml-1 text-ink-faint">{unit}</span>
      </div>
    </div>
  );
}

export function Reports() {
  const supportView = getAdminRole() === 'SUPPORT';
  const [issuance, setIssuance] = useState<any>(null);
  const [bonus, setBonus] = useState<any[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(0);
  const [reload, setReload] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    setFailed(0);
    const tasks: Promise<unknown>[] = [
      api<any>('/admin/reports/performance?days=14')
        .then((r) => setPerformance((r as any).list ?? r ?? []))
        .catch(() => setFailed((n) => n + 1)),
    ];
    if (!supportView) {
      tasks.push(
        api<any>('/admin/reports/issuance').then(setIssuance).catch(() => setFailed((n) => n + 1)),
        api<any[]>('/admin/reports/bonus').then(setBonus).catch(() => setFailed((n) => n + 1)),
        api<any[]>('/admin/reports/hierarchy').then(setHierarchy).catch(() => setFailed((n) => n + 1)),
      );
    }
    Promise.all(tasks).finally(() => setLoading(false));
  }, [supportView]);

  useEffect(() => { void load(); }, [load, reload]);

  const bonusData = bonus.map((b) => ({ name: BONUS_NAMES[b.type] ?? `类型${b.type}`, amount: Number(b.amount) }));
  const perfData = (() => {
    const grouped = new Map<string, number>();
    performance.forEach((p: any) => {
      const date = String(p.statDate).slice(5, 10);
      const value = Number(p.performance ?? p._sum?.ownAmount ?? p.ownAmount ?? 0);
      grouped.set(date, (grouped.get(date) ?? 0) + value);
    });
    return Array.from(grouped, ([date, performanceValue]) => ({ date, performance: performanceValue }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  })();
  const perfTotal = perfData.reduce((sum, item) => sum + item.performance, 0);
  const hierarchyTotal = hierarchy.reduce((sum, h) => sum + Number(h._count?._all ?? 0), 0);
  const maxHierarchy = Math.max(1, ...hierarchy.map((h) => Number(h._count?._all ?? 0)));

  const ledgerRows = [
    {
      title: '权益通 · 额度总账', data: issuance?.transferQuota, tone: 'text-accent-ink', icon: <Coins size={15} />,
      metrics: [['权益通累计发放', issuance?.transferQuota?.granted], ['钱包转出已用', issuance?.transferQuota?.used], ['待确认转账', issuance?.transferQuota?.reserved], ['剩余权益通', issuance?.transferQuota?.available]],
    },
    {
      title: '钱包余额 · 资金总账', data: issuance?.wallet, tone: 'text-success', icon: <Wallet size={15} />,
      metrics: [['累计入账', issuance?.wallet?.issued], ['流通中', issuance?.wallet?.circulating], ['累计出账', issuance?.wallet?.consumed], ['平台沉淀', issuance?.wallet?.sunk]],
    },
  ];

  return (
    <>
      <PageHeader
        title="数据报表"
        description={supportView ? '查看近 14 日平台计酬PV趋势' : '计酬PV趋势、奖金构成、层级分布与虚拟货币发行总账；每日 02:00 日结后更新'}
      />

      {loading ? (
        <Card><TableSkeleton rows={5} cols={4} /></Card>
      ) : failed > 0 ? (
        <Card>
          <ErrorBlock
            text={`有 ${failed} 个报表加载失败，请检查网络或后端服务后重试。`}
            action={<Button size="sm" onClick={() => setReload((n) => n + 1)}>重新加载</Button>}
          />
        </Card>
      ) : (
        <>
          {!supportView && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="近 14 日平台计酬PV"
                  value={formatPv(perfTotal)}
                  icon={<TrendingUp size={17} />}
                  accent="brand"
                  trend={`日均 ${formatPv(perfData.length ? perfTotal / perfData.length : 0)}`}
                />
                <StatCard
                  label="剩余权益通"
                  value={fmtMoney(issuance?.transferQuota?.available)}
                  icon={<Coins size={17} />}
                  accent="info"
                  trend={`档位累计授权 ${fmtMoney(issuance?.transferQuota?.granted)}`}
                />
                <StatCard
                  label="钱包余额流通中"
                  value={fmtMoney(issuance?.wallet?.circulating)}
                  icon={<Wallet size={17} />}
                  accent="success"
                  trend={`平台沉淀 ${fmtMoney(issuance?.wallet?.sunk)}`}
                />
                <StatCard
                  label="团队关系总量"
                  value={String(hierarchyTotal)}
                  icon={<Layers size={17} />}
                  accent="warning"
                  trend={`覆盖 ${hierarchy.length} 个层级`}
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {ledgerRows.map((row) => (
                  <Card key={row.title}>
                    <CardHeader title={row.title} icon={row.icon} />
                    <div className="divide-y divide-line px-4">
                      {row.metrics.map(([label, value]) => (
                        <div key={label as string} className="flex items-center justify-between py-2.5 text-xs">
                          <span className="text-ink-muted">{label}</span>
                          <span className={`num font-medium ${row.tone}`}>{fmtMoney(value)}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
                <Card>
                  <CardHeader title="太阳值 · 记账总账" icon={<Coins size={15} />} />
                  <div className="divide-y divide-line px-4">
                    <div className="flex items-center justify-between py-2.5 text-xs">
                      <span className="text-ink-muted">累计记账</span>
                      <span className="num font-medium text-ink">{fmtMoney(issuance?.token?.issued)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 text-xs">
                      <span className="text-ink-muted">会员账户流通</span>
                      <span className="num font-medium text-ink">{fmtMoney(issuance?.token?.circulating)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 text-xs">
                      <span className="text-ink-muted">会员间转入 / 转出</span>
                      <span className="num font-medium text-ink">{fmtMoney(issuance?.token?.transferIn)} / {fmtMoney(issuance?.token?.transferOut)}</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 text-xs">
                      <span className="text-ink-muted">交易所接入</span>
                      <Badge tone={issuance?.token?.exchangeConnected ? 'success' : 'neutral'}>{issuance?.token?.exchangeConnected ? '已接入' : '未接入'}</Badge>
                    </div>
                    <p className="py-2.5 text-2xs leading-5 text-ink-faint">
                      太阳值按奖金规则记账，支持系统内互转；当前未接入外部交易平台。
                    </p>
                  </div>
                </Card>
              </div>
            </>
          )}

          <div className={`mt-4 grid gap-4 ${supportView ? '' : 'lg:grid-cols-2'}`}>
            <Card>
              <CardHeader
                title="近 14 日平台计酬PV趋势"
                description="按日聚合新订单的计酬PV；1 PV = ¥1 奖金基数"
                icon={<BarChart3 size={15} />}
                action={<Badge tone="brand">14 天</Badge>}
              />
              <div className="h-64 px-3 pb-4 pt-4">
                {perfData.length === 0 || perfTotal === 0 ? (
                  <Empty text="暂无计酬PV数据" description="日结完成后会生成平台计酬PV趋势。" icon={<BarChart3 size={18} />} />
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={perfData} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={16} />
                    <YAxis tickFormatter={compact} tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} width={54} />
                    <Tooltip content={<ChartTooltip format="pv" unit="PV" />} cursor={{ fill: 'var(--hover)' }} />
                    <Bar dataKey="performance" name="平台计酬PV" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </Card>

            {!supportView && (
              <Card>
                <CardHeader
                  title="奖金构成（近 30 日）"
                  description="按奖金类型汇总的发放金额"
                  icon={<Coins size={15} />}
                />
                <div className="h-64 px-3 pb-4 pt-4">
                  {bonusData.length === 0 ? (
                    <Empty text="暂无奖金数据" description="产生奖金发放后，这里会展示类型构成。" />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bonusData} margin={{ top: 4, right: 12, bottom: 0, left: -8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
                        <YAxis tickFormatter={compact} tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={false} width={54} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hover)' }} />
                        <Bar dataKey="amount" name="奖金金额" fill="var(--success-solid)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            )}
          </div>

          {!supportView && (
            <Card className="mt-4">
              <CardHeader title="团队层级分布" description="按关系深度统计的会员人数" icon={<Layers size={15} />} />
              <div className="space-y-3 p-4">
                {hierarchy.length === 0 ? (
                  <Empty text="暂无层级数据" description="团队关系建立后，这里会展示层级分布。" icon={<Layers size={18} />} />
                ) : hierarchy.map((h) => (
                  <div key={h.depth} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-ink-muted">第 {h.depth} 层</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${(Number(h._count?._all ?? 0) / maxHierarchy) * 100}%` }}
                      />
                    </div>
                    <span className="num w-16 shrink-0 text-right text-xs text-ink">
                      {h._count?._all ?? 0} <span className="text-ink-faint">人</span>
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {!loading && supportView && perfData.length === 0 && (
        <div className="mt-4"><ErrorBlock text="暂无业绩数据" /></div>
      )}
    </>
  );
}
