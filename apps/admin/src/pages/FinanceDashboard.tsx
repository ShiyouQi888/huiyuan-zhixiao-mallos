import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Activity, ArrowLeftRight, BadgeDollarSign, BarChart3,
  Coins, CreditCard, RefreshCw, ShieldCheck, ShoppingBag, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, fmtMoney } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, ErrorBlock, PageHeader, StatCard, TableSkeleton,
} from '../components/ui';

const PERIODS = [7, 30, 90] as const;
const COLORS = ['var(--accent)', 'var(--success-solid)', 'var(--warning-solid)', 'var(--info-solid)', '#a78bfa', '#fb7185'];
const ORDER_STATUS_TONES: Record<number, string> = { 0: 'var(--warning-solid)', 1: 'var(--accent)', 2: 'var(--info-solid)', 3: 'var(--success-solid)' };

function compact(value: number) {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}万`;
  return String(Math.round(value));
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-pop">
      <div className="mb-1.5 text-2xs text-ink-faint">{label}</div>
      <div className="space-y-1">
        {payload.filter((item: any) => item.value !== undefined).map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-5">
            <span className="flex items-center gap-1.5 text-ink-muted"><i className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />{item.name}</span>
            <strong className="num font-medium text-ink">{item.dataKey === 'newMembers' ? `${Number(item.value).toLocaleString('zh-CN')} 人` : fmtMoney(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownRows({ rows, valueKey = 'amount', countKey = 'count', format = 'money' }: {
  rows: Array<any>; valueKey?: string; countKey?: string; format?: 'money' | 'count';
}) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(Number(row[valueKey] ?? 0))));
  if (!rows.length) return <Empty text="暂无可展示数据" description="产生业务记录后，这里会自动汇总。" />;
  return (
    <div className="space-y-4 px-4 pb-4">
      {rows.map((row, index) => {
        const value = Math.abs(Number(row[valueKey] ?? 0));
        return (
          <div key={`${row.name ?? row.type ?? row.bizType ?? index}`}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-ink-muted">{row.name ?? `类型 ${row.type}`}</span>
              <span className="flex shrink-0 items-center gap-3 text-ink-faint">
                {row[countKey] !== undefined && <span>{Number(row[countKey]).toLocaleString('zh-CN')} 笔</span>}
                <strong className="num font-medium text-ink">{format === 'money' ? fmtMoney(value) : value.toLocaleString('zh-CN')}</strong>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`${row.name ?? '类型'}占比 ${Math.round(value / max * 100)}%`}>
              <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(2, value / max * 100)}%`, background: COLORS[index % COLORS.length] }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FinanceDashboard() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api<any>(`/admin/finance/dashboard?days=${days}`));
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : '财务大盘加载失败');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const trend = useMemo(() => (data?.trend ?? []).map((row: any) => ({
    ...row,
    walletIn: Number(row.walletIn ?? 0), walletOut: Number(row.walletOut ?? 0),
    orderAmount: Number(row.orderAmount ?? 0), paidOrderAmount: Number(row.paidOrderAmount ?? 0),
    bonusAmount: Number(row.bonusAmount ?? 0), performance: Number(row.performance ?? 0),
    newMembers: Number(row.newMembers ?? 0),
    date: String(row.date ?? '').slice(5),
  })), [data]);

  const orderStatus = data?.orders?.byStatus ?? [];
  const orderTypes = data?.orders?.byType ?? [];
  const orderStatusTotal = orderStatus.reduce((total: number, row: any) => total + Number(row.count), 0);
  const memberTotal = Number(data?.members?.total ?? 0);
  const walletTransfers = data?.wallet?.transfers?.allTime ?? {};
  const walletTransfersPeriod = data?.wallet?.transfers?.period ?? {};
  const completedWalletTransfer = walletTransfers.COMPLETED ?? { count: 0, amount: 0 };
  const pendingWalletTransfer = walletTransfers.PENDING ?? { count: 0, amount: 0 };
  const recentCompletedTransfers = walletTransfersPeriod.COMPLETED ?? { count: 0, amount: 0 };

  const actions = (
    <>
      <div className="flex rounded-lg border border-line bg-panel p-1" aria-label="统计周期">
        {PERIODS.map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={days === period}
            className={`min-h-8 rounded-md px-3 text-xs font-medium transition ${days === period ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-hover hover:text-ink'}`}
            onClick={() => setDays(period)}
          >
            近 {period} 天
          </button>
        ))}
      </div>
      <Button variant="secondary" size="sm" disabled={loading} onClick={() => void load()}>
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新
      </Button>
    </>
  );

  if (!data && loading) {
    return <><PageHeader title="财务大盘" description="平台内部资金、资产额度、订单与会员经营总览" action={actions} /><Card><TableSkeleton rows={8} cols={5} /></Card></>;
  }

  if (!data) {
    return <><PageHeader title="财务大盘" description="平台内部资金、资产额度、订单与会员经营总览" action={actions} /><Card><ErrorBlock text={error || '财务大盘暂时无法加载'} action={<Button size="sm" onClick={() => void load()}>重新加载</Button>} /></Card></>;
  }

  const memberRanks = data.members.rankDistribution ?? [];
  const packageDistribution = data.members.packageDistribution ?? [];

  return (
    <>
      <PageHeader
        title="财务大盘"
        description="会员钱包、权益通、太阳值、订单与会员经营数据；金额单位为元，太阳值为平台内部记账资产，暂未接入外部收款或提现渠道。"
        meta={<Badge tone="info" dot>内部账务 · 不含外部提现</Badge>}
        action={actions}
      />

      {error && <div className="notice notice-warning mb-4"><ShieldCheck size={14} />刷新失败：{error}，当前仍展示上次成功加载的数据。</div>}
      {updatedAt && <div className="mb-3 text-right text-2xs text-ink-faint">更新于 {updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>}

      <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
        <StatCard label="会员钱包账面余额" value={fmtMoney(data.wallet.balance)} icon={<Wallet size={17} />} accent="success" trend={`${Number(data.wallet.accounts).toLocaleString('zh-CN')} 个账户 · 含冻结金额`} />
        <StatCard label="钱包可用余额" value={fmtMoney(data.wallet.available)} icon={<CreditCard size={17} />} accent="brand" trend={`冻结 ${fmtMoney(data.wallet.frozen)}`} />
        <StatCard label="权益通可用总额" value={fmtMoney(data.transferQuota.available)} icon={<BadgeDollarSign size={17} />} accent="info" trend={`已发放 ${fmtMoney(data.transferQuota.granted)} · 已用 ${fmtMoney(data.transferQuota.used)}`} />
        <StatCard label="太阳值流通余额" value={fmtMoney(data.sunValue.circulating)} icon={<Coins size={17} />} accent="amber" trend={`累计发放 ${fmtMoney(data.sunValue.issued)}`} />
        <StatCard label={`近 ${days} 天已支付订单额`} value={fmtMoney(data.orders.period.paidAmount)} icon={<ShoppingBag size={17} />} accent="warning" trend={`${Number(data.orders.period.count).toLocaleString('zh-CN')} 笔新建订单 · 含待支付`} />
        <StatCard label={`近 ${days} 天奖金记账`} value={fmtMoney(data.bonuses.period.amount)} icon={<TrendingUp size={17} />} accent="danger" trend={`待释放 ${fmtMoney(data.bonuses.pendingRelease.amount)}`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="钱包资金账" description="会员钱包账户余额与期间流水" icon={<Wallet size={15} />} action={<Link to="/assets?tab=wallet" className="text-xs font-medium text-accent-ink hover:underline">查看资产</Link>} />
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            <LedgerMetric label="账面余额" value={data.wallet.balance} />
            <LedgerMetric label="可用余额" value={data.wallet.available} tone="text-success" />
            <LedgerMetric label="冻结转账" value={data.wallet.frozen} tone="text-warning" />
            <LedgerMetric label="钱包账户" value={data.wallet.accounts} isCount />
            <LedgerMetric label="累计入账" value={data.wallet.lifetimeIn} />
            <LedgerMetric label="累计扣减" value={data.wallet.lifetimeOut} />
            <LedgerMetric label={`近 ${days} 天入账`} value={data.wallet.period.inflow} />
            <LedgerMetric label={`近 ${days} 天扣减`} value={data.wallet.period.outflow} />
          </div>
          <div className="mx-4 mb-4 rounded-lg border border-line bg-raised/50 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-ink"><ArrowLeftRight size={14} />会员间钱包转出</div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-ink-faint">累计已完成</span><div className="num mt-1 font-semibold text-ink">{fmtMoney(completedWalletTransfer.amount)} <small className="text-2xs font-normal text-ink-faint">{Number(completedWalletTransfer.count).toLocaleString('zh-CN')} 笔</small></div></div>
              <div><span className="text-ink-faint">待接收确认</span><div className="num mt-1 font-semibold text-warning">{fmtMoney(pendingWalletTransfer.amount)} <small className="text-2xs font-normal text-ink-faint">{Number(pendingWalletTransfer.count).toLocaleString('zh-CN')} 笔</small></div></div>
              <div className="col-span-2 border-t border-line pt-2 text-2xs text-ink-faint">近 {days} 天已完成 {fmtMoney(recentCompletedTransfers.amount)}；转账为系统内会员间流转，不代表资金离开平台。</div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="权益通额度账" description="额度发放、已用、预占与剩余" icon={<BadgeDollarSign size={15} />} action={<Link to="/assets?tab=quota" className="text-xs font-medium text-accent-ink hover:underline">查看权益通</Link>} />
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            <LedgerMetric label="累计发放" value={data.transferQuota.granted} />
            <LedgerMetric label="剩余可用" value={data.transferQuota.available} tone="text-info" />
            <LedgerMetric label="累计消耗" value={data.transferQuota.used} />
            <LedgerMetric label="待确认预占" value={data.transferQuota.reserved} tone="text-warning" />
            <LedgerMetric label="后台调减" value={data.transferQuota.adjustedOut} />
            <LedgerMetric label="额度账户" value={data.transferQuota.accounts} isCount />
          </div>
          <div className="mx-4 mb-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-raised/50 p-3">
            <div><span className="text-2xs text-ink-faint">权益通用尽账户</span><div className="num mt-1 text-lg font-semibold text-warning">{Number(data.transferQuota.exhaustedAccounts).toLocaleString('zh-CN')} <small className="text-xs font-normal text-ink-faint">个</small></div></div>
            <div><span className="text-2xs text-ink-faint">历史超额消耗</span><div className="num mt-1 text-lg font-semibold text-danger">{fmtMoney(data.transferQuota.overage)}</div></div>
            <div className="col-span-2 border-t border-line pt-2 text-2xs leading-5 text-ink-faint">权益通是会员转出及商城钱包消费的业务额度，不是钱包余额或可提现金额；超额历史记录会单独展示。</div>
          </div>
        </Card>

        <Card>
          <CardHeader title="太阳值资产账" description="虚拟资产发行、账户流通与会员互转" icon={<Coins size={15} />} action={<Link to="/assets?tab=tokens" className="text-xs font-medium text-accent-ink hover:underline">查看太阳值</Link>} />
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            <LedgerMetric label="当前流通余额" value={data.sunValue.circulating} tone="text-warning" />
            <LedgerMetric label="太阳值账户" value={data.sunValue.accounts} isCount />
            <LedgerMetric label="累计奖金发放" value={data.sunValue.issued} />
            <LedgerMetric label="累计转入" value={data.sunValue.lifetimeTransferIn} />
            <LedgerMetric label="累计转出" value={data.sunValue.lifetimeTransferOut} />
            <LedgerMetric label={`近 ${days} 天转入`} value={data.sunValue.period.inflow} />
            <LedgerMetric label={`近 ${days} 天转出`} value={data.sunValue.period.outflow} />
            <LedgerMetric label="外部交易接入" value="未接入" isText />
          </div>
          <div className="mx-4 mb-4 rounded-lg border border-line bg-raised/50 p-3 text-2xs leading-5 text-ink-faint">太阳值当前仅用于系统内记账和会员互转；转入、转出会改变持有人，不增加平台发行总额。</div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader title="资金与经营趋势" description={`近 ${days} 天每日汇总，包含钱包账务、订单、奖金与计酬业绩`} icon={<Activity size={15} />} />
          {trend.length ? (
            <div className="h-[310px] px-3 pb-4 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trend} margin={{ top: 6, right: 10, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--ink-4)', fontSize: 11 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={22} />
                  <YAxis tickFormatter={compact} tick={{ fill: 'var(--ink-4)', fontSize: 10 }} tickLine={false} axisLine={false} width={50} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hover)' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'var(--ink-3)' }} />
                  <Area type="monotone" dataKey="orderAmount" name="订单创建额" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
                  <Bar dataKey="walletIn" name="钱包入账" fill="var(--success-solid)" opacity={0.78} radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="walletOut" name="钱包扣减" fill="var(--warning-solid)" opacity={0.72} radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="bonusAmount" name="奖金记账" fill="var(--info-solid)" opacity={0.78} radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Area type="monotone" dataKey="performance" name="计酬业绩" stroke="#a78bfa" fill="transparent" strokeDasharray="5 4" strokeWidth={1.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty text="暂无趋势数据" description="选择的周期内暂未产生财务或经营记录。" icon={<BarChart3 size={18} />} />}
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="订单状态分布" description={`近 ${days} 天新建 ${orderStatusTotal.toLocaleString('zh-CN')} 笔 · 累计已支付 ${fmtMoney(data.orders.paidLifetimeAmount)}`} icon={<ShoppingBag size={15} />} action={<Link to="/orders" className="text-xs font-medium text-accent-ink hover:underline">订单管理</Link>} />
          <div className="space-y-4 px-4 pb-4">
            {orderStatus.length ? orderStatus.map((row: any) => (
              <div key={row.status}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-2 text-ink-muted"><i className="h-2 w-2 rounded-full" style={{ background: ORDER_STATUS_TONES[row.status] ?? COLORS[0] }} />{row.name}</span>
                  <span className="num text-ink">{Number(row.count).toLocaleString('zh-CN')} 笔 <span className="ml-2 text-ink-faint">{fmtMoney(row.amount)}</span></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full" style={{ width: `${Math.max(2, Number(row.count) / Math.max(1, orderStatusTotal) * 100)}%`, background: ORDER_STATUS_TONES[row.status] ?? COLORS[0] }} /></div>
              </div>
            )) : <Empty text="暂无订单" />}
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
              <div><span className="text-ink-faint">新建订单额（含待支付）</span><strong className="num mt-1 block text-ink">{fmtMoney(data.orders.period.amount)}</strong></div>
              <div><span className="text-ink-faint">已支付订单额</span><strong className="num mt-1 block text-ink">{fmtMoney(data.orders.period.paidAmount)}</strong></div>
              <div><span className="text-ink-faint">钱包余额扣款</span><strong className="num mt-1 block text-ink">{fmtMoney(data.orders.period.balancePaid)}</strong></div>
              <div><span className="text-ink-faint">外部现金收款</span><strong className="num mt-1 block text-ink">{fmtMoney(data.orders.period.cashPaid)}</strong></div>
            </div>
            <div className="border-t border-line pt-3">
              <div className="mb-2 text-2xs font-medium text-ink-faint">按订单类型</div>
              {orderTypes.map((row: any, index: number) => (
                <div key={row.type} className="flex items-center justify-between py-1.5 text-xs">
                  <span className="flex items-center gap-2 text-ink-muted"><i className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />{row.name}</span>
                  <span className="num text-ink">{Number(row.count).toLocaleString('zh-CN')} 笔 · {fmtMoney(row.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="钱包流水类型" description={`近 ${days} 天 · 入账 ${fmtMoney(data.wallet.period.inflow)} / 扣减 ${fmtMoney(data.wallet.period.outflow)}`} icon={<ArrowLeftRight size={15} />} action={<Link to="/assets?tab=wallet" className="text-xs font-medium text-accent-ink hover:underline">流水</Link>} />
          <BreakdownRows rows={data.wallet.period.byType.map((row: any) => ({ ...row, amount: Math.abs(Number(row.amount)) }))} />
        </Card>
        <Card>
          <CardHeader title="权益通变动类型" description={`近 ${days} 天按业务类型归集`} icon={<BadgeDollarSign size={15} />} action={<Link to="/assets?tab=quota" className="text-xs font-medium text-accent-ink hover:underline">流水</Link>} />
          <BreakdownRows rows={data.transferQuota.periodByBusiness.map((row: any) => ({ ...row, amount: Math.abs(Number(row.changeAmount)) }))} />
        </Card>
        <Card>
          <CardHeader title="奖金构成与拆分" description={`近 ${days} 天 ${fmtMoney(data.bonuses.period.amount)} · 累计 ${fmtMoney(data.bonuses.lifetime.amount)}`} icon={<TrendingUp size={15} />} action={<Link to="/bonuses" className="text-xs font-medium text-accent-ink hover:underline">奖金管理</Link>} />
          <BreakdownRows rows={data.bonuses.byType} />
          <div className="mx-4 mb-4 flex items-center justify-between rounded-lg border border-line bg-raised/50 p-3 text-xs">
            <span className="text-ink-muted">待释放奖金计划</span><strong className="num text-warning">{fmtMoney(data.bonuses.pendingRelease.amount)} <small className="text-2xs font-normal text-ink-faint">{Number(data.bonuses.pendingRelease.plans).toLocaleString('zh-CN')} 项</small></strong>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader title="会员资金覆盖" description={`${memberTotal.toLocaleString('zh-CN')} 位注册会员 · 当前周期新增 ${Number(data.members.newInPeriod).toLocaleString('zh-CN')} 位`} icon={<Users size={15} />} action={<Link to="/members" className="text-xs font-medium text-accent-ink hover:underline">会员管理</Link>} />
          <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-4">
            <MemberMetric label="正常会员" value={data.members.active} tone="text-success" />
            <MemberMetric label="已冻结" value={data.members.frozen} tone="text-warning" />
            <MemberMetric label="已注销" value={data.members.deleted} />
            <MemberMetric label="持有档位" value={data.members.withPackage} tone="text-accent-ink" />
          </div>
          <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-2">
            <div>
              <div className="mb-3 text-xs font-semibold text-ink">业务等级分布</div>
              <BreakdownRows rows={memberRanks.map((row: any) => ({ ...row, amount: row.count }))} valueKey="amount" format="count" countKey="_none" />
            </div>
            <div>
              <div className="mb-3 text-xs font-semibold text-ink">会员档位分布</div>
              <BreakdownRows rows={packageDistribution.map((row: any) => ({ ...row, amount: row.count }))} valueKey="amount" format="count" countKey="_none" />
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader title="每日新增会员" description={`近 ${days} 天注册趋势`} icon={<Users size={15} />} />
          {trend.some((row: any) => row.newMembers > 0) ? (
            <div className="h-[246px] px-3 pb-4 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 10, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--ink-4)', fontSize: 10 }} tickLine={false} axisLine={{ stroke: 'var(--line)' }} minTickGap={20} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--ink-4)', fontSize: 10 }} tickLine={false} axisLine={false} width={38} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--hover)' }} />
                  <Area type="monotone" dataKey="newMembers" name="新增会员" stroke="var(--accent)" fill="var(--accent-soft)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty text="暂无新增会员" description="选择周期内没有新注册记录。" icon={<Users size={18} />} />}
          <div className="mx-4 mb-4 grid grid-cols-2 gap-3 rounded-lg border border-line bg-raised/50 p-3 text-xs">
            <div><span className="text-ink-faint">会员礼包订单</span><strong className="num mt-1 block text-ink">{Number(orderTypes.filter((row: any) => row.type !== 4).reduce((sum: number, row: any) => sum + Number(row.count), 0)).toLocaleString('zh-CN')} 笔</strong></div>
            <div><span className="text-ink-faint">商品订单</span><strong className="num mt-1 block text-ink">{Number(orderTypes.find((row: any) => row.type === 4)?.count ?? 0).toLocaleString('zh-CN')} 笔</strong></div>
          </div>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-2xs text-ink-faint">
        <span className="flex items-center gap-2"><ShieldCheck size={14} />平台财务数据仅反映系统内部账本，不等同银行存款、外部清算或提现数据。</span>
        <span>订单已支付口径包含待交付、已交付和已完成；未支付订单不计入已支付订单额。</span>
      </div>
    </>
  );
}

function LedgerMetric({ label, value, tone = 'text-ink', isCount = false, isText = false }: { label: string; value: unknown; tone?: string; isCount?: boolean; isText?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-raised/50 px-3 py-2.5">
      <div className="truncate text-2xs text-ink-faint">{label}</div>
      <div className={`num mt-1 truncate text-sm font-semibold ${tone}`}>
        {isText ? String(value) : isCount ? Number(value ?? 0).toLocaleString('zh-CN') : fmtMoney(value)}
      </div>
    </div>
  );
}

function MemberMetric({ label, value, tone = 'text-ink' }: { label: string; value: unknown; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-raised/50 px-3 py-3">
      <div className="text-2xs text-ink-faint">{label}</div>
      <div className={`num mt-1.5 text-xl font-semibold ${tone}`}>{Number(value ?? 0).toLocaleString('zh-CN')}<small className="ml-1 text-2xs font-normal text-ink-faint">人</small></div>
    </div>
  );
}
