import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import {
  Activity, ArrowLeftRight, ArrowRight, ArrowUpRight, ChevronRight, CircleDollarSign,
  ClipboardCheck, RefreshCw, ShieldAlert, TrendingUp, Truck, Users, Wallet,
} from 'lucide-react';
import { api, fmtDate, fmtMoney, getAdminRole } from '../api';
import type { DashboardData } from '../types';
import {
  Badge, Button, Card, CardHeader, Empty, ErrorBlock, PageHeader, StatCard, TableSkeleton, cx,
} from '../components/ui';

const RANK_NAMES = ['普通会员', '业务主任', '业务经理', '业务总监', '业务副总', '业务总经理', '业务总裁'];
const RANK_COLORS = ['#ff5a1f', '#fb923c', '#fbbf24', '#d97706', '#b45309', '#7c2d12', '#a8a29e'];
const ORDER_STATUS_LABELS = ['待支付', '已支付', '已交付', '已完成'];
const ORDER_STATUS_TONES = ['warning', 'brand', 'info', 'success'] as const;

export function Dashboard() {
  const role = getAdminRole();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api<DashboardData>('/admin/dashboard'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '工作台数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const refreshAction = (
    <Button variant="secondary" disabled={loading} onClick={() => void load()}>
      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      刷新数据
    </Button>
  );

  if (!data && loading) {
    return (
      <>
        <PageHeader title="工作台" description="平台经营指标与近期业务动态" action={refreshAction} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item} className="p-4">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton mt-3 h-7 w-28" />
              <div className="skeleton mt-3 h-3 w-24" />
            </Card>
          ))}
        </div>
        <Card className="mt-4">
          <TableSkeleton rows={7} cols={5} />
        </Card>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title="工作台" description="平台经营指标与近期业务动态" action={refreshAction} />
        <Card>
          <ErrorBlock
            text={error || '工作台暂时无法加载'}
            action={<Button size="sm" onClick={() => void load()}>重新加载</Button>}
          />
        </Card>
      </>
    );
  }

  const pendingDelivery = data.pendingDeliveryOrders ?? 0;
  const pendingApprovals = data.pendingApprovals ?? 0;
  const pendingTransfers = data.pendingTransfers ?? 0;
  const pendingRisk = data.pendingRiskEvents ?? 0;
  const totalPending = pendingDelivery + pendingApprovals + pendingTransfers + pendingRisk;
  const rankTotal = data.rankDistribution.reduce((sum, rank) => sum + rank.count, 0);
  const rankCounts = new Map(data.rankDistribution.map((rank) => [rank.level, rank.count]));
  const pieData = data.rankDistribution
    .filter((rank) => rank.count > 0)
    .map((rank) => ({
      level: rank.level,
      name: RANK_NAMES[rank.level] ?? `等级 ${rank.level}`,
      count: rank.count,
      color: RANK_COLORS[rank.level % RANK_COLORS.length],
    }));
  const canOperate = !!role && ['SUPER_ADMIN', 'OPERATOR'].includes(role);

  const todoItems = [
    ...(canOperate ? [{
      to: '/orders?status=1',
      title: '待交付订单',
      description: '已付款，等待管理端交付',
      count: pendingDelivery,
      icon: <Truck size={16} />,
    }] : []),
    {
      to: '/approvals',
      title: role === 'OPERATOR' ? '我的审批申请' : '审批待办',
      description: role === 'OPERATOR' ? '查看已提交申请的处理进度' : '待复核的业务变更申请',
      count: pendingApprovals,
      icon: <ClipboardCheck size={16} />,
    },
    ...(canOperate ? [
      {
        to: '/assets?tab=walletTransfers',
        title: '待审核转账',
        description: '钱包余额风险转账与额度占用',
        count: pendingTransfers,
        icon: <ArrowLeftRight size={16} />,
      },
      {
        to: '/risk',
        title: '风控待处理',
        description: '尚未完成处置的风险事件',
        count: pendingRisk,
        icon: <ShieldAlert size={16} />,
      },
    ] : []),
  ];

  return (
    <>
      <PageHeader
        title="工作台"
        description="平台经营指标与近期业务动态"
        action={(
          <>
            {refreshAction}
            <Link to="/settlements" className="btn btn-primary">
              <Activity size={14} /> 日结管理
            </Link>
          </>
        )}
      />

      {error && (
        <div className="notice notice-warning mb-4">
          <ShieldAlert size={14} />
          刷新失败：{error}，当前展示的是上次成功加载的数据。
        </div>
      )}

      <div className={cx('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', loading && 'opacity-60 transition-opacity')}>
        <StatCard label="会员总数" value={data.memberCount.toLocaleString('zh-CN')} icon={<Users size={17} />} trend="平台注册会员" accent="brand" />
        <StatCard label="今日订单" value={data.todayOrders.toLocaleString('zh-CN')} icon={<Wallet size={17} />} trend="当日新增订单" accent="success" />
        <StatCard label="今日业绩" value={fmtMoney(data.todayPerformance)} icon={<TrendingUp size={17} />} trend="全网当日新增业绩" accent="warning" />
        <StatCard label="累计奖金" value={fmtMoney(data.totalBonus)} icon={<CircleDollarSign size={17} />} trend="五条收益线合计" accent="danger" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader
            title="待办工作"
            description="按当前角色汇总需要跟进的订单、审批与风险事项"
            action={(
              <span className={cx('badge', totalPending > 0 ? 'badge-warning' : 'badge-success')}>
                {totalPending > 0 ? `${totalPending} 项待处理` : '全部已处理'}
              </span>
            )}
          />
          {todoItems.every((item) => item.count === 0) ? (
            <Empty
              text="当前没有待处理事项"
              description="新订单或申请进入后会显示在这里。"
              icon={<ClipboardCheck size={18} />}
            />
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {todoItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex items-center gap-3 px-4 py-3 transition hover:bg-hover"
                >
                  <span className={cx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    item.count > 0 ? 'bg-warning-soft text-warning' : 'bg-raised text-ink-faint',
                  )}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                    <span className="mt-0.5 block truncate text-2xs text-ink-faint">{item.description}</span>
                  </span>
                  <span className={cx('num text-base font-semibold', item.count > 0 ? 'text-warning' : 'text-ink-faint')}>
                    {item.count}
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-ink-3" />
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader
            title="会员等级分布"
            description={`按职级统计 · 合计 ${rankTotal.toLocaleString('zh-CN')} 人`}
            action={(
              <Link to="/members" className="flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
                查看会员 <ArrowUpRight size={13} />
              </Link>
            )}
          />
          <div className="p-4">
            {data.rankDistribution.length === 0 ? (
              <Empty text="暂无等级数据" />
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative mx-auto h-[150px] w-[150px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="count"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={70}
                        paddingAngle={2}
                        stroke="none"
                        startAngle={90}
                        endAngle={-270}
                        isAnimationActive={false}
                      >
                        {pieData.map((entry) => <Cell key={entry.level} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="num text-xl font-semibold leading-6 text-ink">{rankTotal.toLocaleString('zh-CN')}</span>
                    <span className="mt-0.5 text-2xs text-ink-faint">会员总数</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {RANK_NAMES.map((name, level) => {
                    const count = rankCounts.get(level) ?? 0;
                    const percent = rankTotal > 0 ? (count / rankTotal) * 100 : 0;
                    return (
                      <div key={name} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: RANK_COLORS[level] }} aria-hidden="true" />
                        <span className={count > 0 ? 'truncate text-ink-soft' : 'truncate text-ink-faint'}>{name}</span>
                        <span className={cx('ml-auto num', count > 0 ? 'font-medium text-ink' : 'text-ink-faint')}>
                          {count.toLocaleString('zh-CN')}
                        </span>
                        <span className="w-10 shrink-0 text-right num text-2xs text-ink-faint">{percent.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="最近订单"
          description="最新 8 笔订单动态"
          action={(
            <Link to="/orders" className="flex items-center gap-1 text-xs font-medium text-accent-ink hover:underline">
              全部订单 <ArrowUpRight size={13} />
            </Link>
          )}
        />
        {data.recentOrders.length === 0 ? (
          <Empty text="暂无订单" description="会员下单后，最新订单会显示在这里。" />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th">订单号</th>
                  <th className="th">会员</th>
                  <th className="th text-right">金额</th>
                  <th className="th">状态</th>
                  <th className="th">下单时间</th>
                  <th className="th w-10 text-right" aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((order) => (
                  <tr key={order.id} className="admin-row">
                    <td className="td mono text-xs text-ink-muted">{order.orderNo}</td>
                    <td className="td">
                      <div className="cell-strong truncate">{order.user?.nickname ?? '—'}</div>
                      {order.user?.phone && <div className="cell-muted">{order.user.phone}</div>}
                    </td>
                    <td className="td num text-right font-medium text-ink">{fmtMoney(order.amount)}</td>
                    <td className="td">
                      <Badge tone={ORDER_STATUS_TONES[order.status] ?? 'neutral'} dot>
                        {ORDER_STATUS_LABELS[order.status] ?? '未知'}
                      </Badge>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(order.createdAt)}</td>
                    <td className="td text-right">
                      <Link to="/orders" className="inline-flex text-ink-faint transition hover:text-accent" aria-label="查看订单">
                        <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
