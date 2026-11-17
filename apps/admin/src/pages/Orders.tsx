import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MapPin, Package, RefreshCw, Truck } from 'lucide-react';
import { api, fmtDate, fmtMoney, getAdminRole, post } from '../api';
import {
  Badge, Button, Card, Empty, ErrorBlock, Field, FilterBar, KeyValue, LoadingBlock, Modal, PageHeader,
  Pagination, SearchField, SelectField, TableSkeleton, TextInput, Toast, cx, useConfirm,
} from '../components/ui';

const TYPE_NAMES: Record<number, string> = { 1: '新购礼包', 2: '档位升级', 3: '复消', 4: '普通商品' };
const STATUS_NAMES = ['待支付', '已支付待发货', '已发货', '已完成'];
const STATUS_TONES = ['warning', 'brand', 'info', 'success'] as const;
const PAGE_SIZE = 20;

interface Order {
  id: string | number;
  orderNo: string;
  type: number;
  isRepurchase: boolean;
  amount: number;
  pvAmount: number | string;
  equityDeduct: number;
  balanceDeduct: number;
  cashPay: number;
  status: number;
  createdAt: string;
  paidAt?: string | null;
  businessEffectsAppliedAt?: string | null;
  shippingCarrier?: string | null;
  trackingNo?: string | null;
  deliveredAt?: string | null;
  finishedAt?: string | null;
  remark?: string | null;
  shippingAddress?: { receiver: string; phone: string; province: string; city: string; district: string; detail: string } | null;
  user?: { nickname?: string | null; phone?: string | null };
  items?: Array<{ id: string | number; name: string; price: number; pv: number | string; quantity: number; amount: number }>;
}

interface OrderPage {
  list: Order[];
  total: number;
  page: number;
  pageSize: number;
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(window.location.search).get('status') ?? 'all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Order | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState('');
  const [shippingCarrier, setShippingCarrier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [toast, setToast] = useState('');
  const { confirm, confirmNode } = useConfirm();
  const canDeliver = ['SUPER_ADMIN', 'OPERATOR'].includes(getAdminRole() ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const result = await api<OrderPage | Order[]>(`/admin/orders?${params.toString()}`);
      setOrders(Array.isArray(result) ? result : (result.list ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : '订单加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page, statusFilter, typeFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 220);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openDetail = async (order: Order) => {
    setDetail(order);
    setDetailError('');
    setDeliveryMessage('');
    setShippingCarrier(order.shippingCarrier ?? '');
    setTrackingNo(order.trackingNo ?? '');
    setDetailLoading(true);
    try {
      setDetail(await api<Order>(`/admin/orders/${encodeURIComponent(order.orderNo)}`));
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : '订单详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailError('');
    setDeliveryMessage('');
  };

  const markDelivered = async () => {
    if (!detail || detail.status !== 1 || !canDeliver) return;
    if (!trackingNo.trim()) {
      setDeliveryMessage('请先填写快递单号。');
      return;
    }
    const agreed = await confirm({
      title: '确认订单已交付？',
      description: `订单 ${detail.orderNo} 将登记运单信息并标记为已发货。订单业绩与权益已在支付成功时入账。`,
      confirmText: '确认交付',
      confirmationText: `交付订单 ${detail.orderNo}`,
    });
    if (!agreed) return;
    setDeliveryBusy(true);
    setDeliveryMessage('');
    try {
      const updated = await post<Order>(`/admin/orders/${encodeURIComponent(detail.orderNo)}/deliver`, {
        shippingCarrier: shippingCarrier.trim() || undefined,
        trackingNo: trackingNo.trim(),
      });
      setDetail((current) => current ? { ...current, ...updated } : current);
      setOrders((current) => current.map((order) => order.orderNo === updated.orderNo ? { ...order, ...updated } : order));
      setDeliveryMessage('物流信息已登记，订单已标记为发货。');
      setToast('物流信息已登记');
    } catch (e) {
      setDeliveryMessage(e instanceof Error ? e.message : '交付状态更新失败');
    } finally {
      setDeliveryBusy(false);
    }
  };

  const hasFilter = !!keyword || statusFilter !== 'all' || typeFilter !== 'all';
  const resetFilters = () => { setKeyword(''); setStatusFilter('all'); setTypeFilter('all'); setPage(1); };

  return (
    <>
      <PageHeader
        title="订单管理"
        description="支付成功即登记业绩、权益与奖励计划；在订单详情录入运单后确认发货。"
        action={(
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新
          </Button>
        )}
      />

      <Card className="overflow-hidden">
        <FilterBar>
          <SearchField
            className="w-full sm:w-[280px]"
            placeholder="搜索订单号 / 会员 / 手机号"
            value={keyword}
            onChange={(event) => { setPage(1); setKeyword(event.target.value); }}
          />
          <SelectField
            ariaLabel="订单状态筛选"
            className="w-[124px]"
            value={statusFilter}
            onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}
            options={[
              { value: 'all', label: '全部状态' },
              ...STATUS_NAMES.map((name, status) => ({ value: String(status), label: name })),
            ]}
          />
          <SelectField
            ariaLabel="订单类型筛选"
            className="w-[132px]"
            value={typeFilter}
            onChange={(event) => { setPage(1); setTypeFilter(event.target.value); }}
            options={[
              { value: 'all', label: '全部类型' },
              ...Object.entries(TYPE_NAMES).map(([type, name]) => ({ value: type, label: name })),
            ]}
          />
          {hasFilter && <Button size="sm" variant="ghost" onClick={resetFilters}>重置筛选</Button>}
          <div className="ml-auto text-xs text-ink-faint">
            本页 <span className="num text-ink-soft">{orders.length}</span> 笔订单
          </div>
        </FilterBar>

        {error ? (
          <ErrorBlock text={`订单加载失败：${error}`} action={<Button size="sm" onClick={() => void load()}>重试</Button>} />
        ) : loading && orders.length === 0 ? (
          <TableSkeleton rows={8} cols={8} />
        ) : orders.length === 0 ? (
          <Empty
            text={hasFilter ? '当前筛选条件下没有订单' : '暂无订单'}
            description={hasFilter ? '尝试调整关键词或筛选条件后重新查询。' : '会员下单后会在这里展示。'}
            icon={<Package size={18} />}
          />
        ) : (
          <div className={cx('table-wrap transition-opacity', loading && 'opacity-60')}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th">订单号</th>
                  <th className="th">会员</th>
                  <th className="th">类型</th>
                  <th className="th text-right">订单金额</th>
                  <th className="th text-right">计酬 PV</th>
                  <th className="th">支付构成</th>
                  <th className="th text-right">现金支付</th>
                  <th className="th">状态</th>
                  <th className="th">下单时间</th>
                  <th className="th text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="admin-row">
                    <td className="td mono text-xs text-ink-muted">{order.orderNo}</td>
                    <td className="td">
                      <div className="cell-strong truncate">{order.user?.nickname ?? '—'}</div>
                      <div className="cell-muted mono">{order.user?.phone ?? ''}</div>
                    </td>
                    <td className="td">
                      <Badge tone="neutral">{TYPE_NAMES[order.type] ?? '订单'}</Badge>
                      {order.type === 4 && order.isRepurchase && <Badge tone="info">会员商品订单奖励</Badge>}
                    </td>
                    <td className="td num text-right font-medium text-ink">{fmtMoney(order.amount)}</td>
                    <td className="td num text-right text-accent-ink">{Number(order.pvAmount ?? order.amount).toLocaleString('zh-CN')} PV</td>
                    <td className="td">
                      {Number(order.equityDeduct) > 0 && <div className="num text-2xs text-ink-muted">历史权益抵扣 {fmtMoney(order.equityDeduct)}</div>}
                      <div className="num text-2xs text-ink-faint">钱包余额 {fmtMoney(order.balanceDeduct)}</div>
                    </td>
                    <td className="td num text-right text-ink-soft">{fmtMoney(order.cashPay)}</td>
                    <td className="td">
                      <Badge tone={STATUS_TONES[order.status] ?? 'neutral'} dot>
                        {STATUS_NAMES[order.status] ?? '未知'}
                      </Badge>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(order.createdAt)}</td>
                    <td className="td text-right">
                      <Button size="xs" variant="ghost" className="text-accent-ink" onClick={() => void openDetail(order)}>
                        查看详情
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} pageSize={PAGE_SIZE} disabled={loading} hasNext={orders.length >= PAGE_SIZE} onChange={setPage} />
      </Card>

      <Modal
        open={!!detail}
        onClose={closeDetail}
        title="订单详情"
        description={detail ? <span className="mono">{detail.orderNo}</span> : undefined}
        size="lg"
        footer={detail ? (
          <>
            <Button onClick={closeDetail}>关闭</Button>
            {detail.status === 1 && canDeliver && (
              <Button variant="primary" onClick={() => void markDelivered()} disabled={deliveryBusy || !trackingNo.trim()}>
                {deliveryBusy ? <RefreshCw size={14} className="animate-spin" /> : <Truck size={14} />}
                {deliveryBusy ? '处理中…' : '确认交付'}
              </Button>
            )}
          </>
        ) : undefined}
      >
        {detailLoading ? (
          <LoadingBlock text="正在加载订单详情…" />
        ) : detailError ? (
          <div className="notice notice-danger">{detailError}</div>
        ) : detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONES[detail.status] ?? 'neutral'} dot>{STATUS_NAMES[detail.status] ?? '未知'}</Badge>
              <Badge tone="neutral">{TYPE_NAMES[detail.type] ?? '订单'}</Badge>
              <span className="num ml-auto text-lg font-semibold text-ink">{fmtMoney(detail.amount)}</span>
            </div>

            <div className="subtle-panel grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
              <KeyValue label="会员" value={detail.user?.nickname ?? '—'} />
              <KeyValue label="手机号" value={detail.user?.phone ?? '—'} mono />
              <KeyValue label="订单计酬PV" value={`${Number(detail.pvAmount ?? detail.amount).toLocaleString('zh-CN')} PV`} />
              <KeyValue label="业务入账时间" value={fmtDate(detail.businessEffectsAppliedAt)} />
              {detail.type === 4 && <KeyValue label="权益通处理" value={detail.isRepurchase ? '支付成功后按订单PV × 3发放' : '非档位会员商品订单，不增发权益通'} />}
              <KeyValue label="创建时间" value={fmtDate(detail.createdAt)} />
              <KeyValue label="支付时间" value={fmtDate(detail.paidAt)} />
              <KeyValue label="交付时间" value={fmtDate(detail.deliveredAt)} />
              <KeyValue label="完成时间" value={fmtDate(detail.finishedAt)} />
            </div>

            {detail.shippingAddress && (
              <section className="notice">
                <MapPin size={15} className="mt-0.5 shrink-0 text-accent-ink" />
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-ink-soft">收货信息</div>
                  <div className="text-sm font-medium text-ink">{detail.shippingAddress.receiver} · {detail.shippingAddress.phone}</div>
                  <div className="mt-1 break-words text-xs text-ink-muted">
                    {detail.shippingAddress.province}{detail.shippingAddress.city}{detail.shippingAddress.district}{detail.shippingAddress.detail}
                  </div>
                </div>
              </section>
            )}

            {(detail.trackingNo || detail.shippingCarrier) && (
              <section className="notice notice-success">
                <Truck size={15} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="mb-1 text-xs font-medium text-ink-soft">物流信息</div>
                  <div className="text-sm font-medium text-ink">{detail.shippingCarrier || '快递'} · {detail.trackingNo || '暂无单号'}</div>
                  <div className="mt-1 text-xs text-ink-muted">{detail.deliveredAt ? `发货时间 ${fmtDate(detail.deliveredAt)}` : '运单信息已登记'}</div>
                </div>
              </section>
            )}

            {detail.status === 1 && canDeliver && (
              <section className="subtle-panel grid gap-3 p-4 sm:grid-cols-2" aria-label="填写物流信息">
                <div className="sm:col-span-2">
                  <div className="text-sm font-semibold text-ink">发货信息</div>
                  <p className="mt-1 text-xs text-ink-muted">录入快递单号后确认发货，会员可在 H5 订单中心查看。</p>
                </div>
                <Field label="快递公司">
                  <TextInput className="input" value={shippingCarrier} onChange={(event) => setShippingCarrier(event.target.value.slice(0, 64))} placeholder="例如：顺丰速运（选填）" />
                </Field>
                <Field label="快递单号" required>
                  <TextInput className="input" value={trackingNo} onChange={(event) => setTrackingNo(event.target.value.slice(0, 128))} placeholder="请输入快递单号" />
                </Field>
              </section>
            )}

            <div>
              <div className="mb-2 text-xs font-medium text-ink-soft">支付构成</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ...(Number(detail.equityDeduct) > 0 ? [{ label: '历史权益抵扣', value: detail.equityDeduct }] : []),
                  { label: '钱包余额', value: detail.balanceDeduct },
                  { label: '现金支付', value: detail.cashPay },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-line px-3 py-2">
                    <div className="text-2xs text-ink-faint">{item.label}</div>
                    <div className="num mt-0.5 text-sm font-medium text-ink">{fmtMoney(item.value)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-ink-soft">订单商品</div>
              {detail.items?.length ? (
                <div className="table-wrap rounded-lg border border-line">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th className="th">商品</th>
                        <th className="th text-right">单价</th>
                        <th className="th text-right">单件 PV</th>
                        <th className="th text-right">数量</th>
                        <th className="th text-right">小计</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((item) => (
                        <tr key={item.id}>
                          <td className="td text-ink">{item.name}</td>
                          <td className="td num text-right">{fmtMoney(item.price)}</td>
                          <td className="td num text-right text-accent-ink">{Number(item.pv).toLocaleString('zh-CN')} PV</td>
                          <td className="td num text-right">{item.quantity}</td>
                          <td className="td num text-right font-medium text-ink">{fmtMoney(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg bg-raised px-4 py-3 text-xs text-ink-faint">此订单没有商品明细</div>
              )}
            </div>

            {detail.remark && (
              <div className="notice">
                <div>
                  <div className="mb-0.5 text-2xs text-ink-faint">订单备注</div>
                  {detail.remark}
                </div>
              </div>
            )}

            {detail.status >= 2 && (
              <div className="notice notice-success">
                <CheckCircle2 size={14} />
                已发货{detail.deliveredAt ? ` · ${fmtDate(detail.deliveredAt)}` : ''}
              </div>
            )}
            {deliveryMessage && (
              <div className={cx('notice', /失败|错误|不存在/.test(deliveryMessage) ? 'notice-danger' : 'notice-success')}>
                {deliveryMessage}
              </div>
            )}
          </div>
        )}
      </Modal>

      {confirmNode}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast('')} />}
    </>
  );
}
