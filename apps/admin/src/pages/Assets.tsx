import { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, FileClock, RefreshCw, X } from 'lucide-react';
import { api, fmtDate, fmtMoney, getAdminRole, post } from '../api';
import {
  Badge, Button, Card, Drawer, Empty, Field, FilterBar, Modal, PageHeader, Pagination,
  SearchField, TableSkeleton, TextInput, Tabs, Toast, useConfirm,
} from '../components/ui';

const TABS = [
  { key: 'wallet', label: '钱包账户' },
  { key: 'equity', label: '权益值账户' },
  { key: 'lots', label: '已过期批次' },
  { key: 'walletTransfers', label: '钱包转账' },
  { key: 'equityTransfers', label: '权益值转账' },
  { key: 'tokens', label: '数权总账' },
] as const;
type AssetTab = typeof TABS[number]['key'];
const PAGE_SIZE = 20;

interface TransferRow {
  id: string;
  transferNo: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  status: string;
  riskFlag: number;
  remark?: string | null;
  createdAt: string;
  completedAt?: string | null;
  fromUser?: { nickname?: string | null; phone?: string | null };
  toUser?: { nickname?: string | null; phone?: string | null };
}

const TRANSFER_STATUS: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  PENDING: { label: '待确认', tone: 'warning' },
  COMPLETED: { label: '已完成', tone: 'success' },
  REJECTED: { label: '已拒绝', tone: 'danger' },
  EXPIRED: { label: '已过期', tone: 'neutral' },
};

const LEDGER_TYPE: Record<number, string> = {
  1: '奖金入账', 2: '消费扣款', 3: '转出', 4: '转入', 5: '人工调整', 6: '转账退回',
};

export function Assets() {
  const [tab, setTab] = useState<AssetTab>(() => new URLSearchParams(window.location.search).get('tab') === 'walletTransfers' ? 'walletTransfers' : 'wallet');
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [adjust, setAdjust] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [ledgerUser, setLedgerUser] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [lotUser, setLotUser] = useState<any>(null);
  const [lots, setLots] = useState<any[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [busyTransfer, setBusyTransfer] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const { confirm, confirmNode } = useConfirm();
  const role = getAdminRole();
  const canManageFunds = role === 'SUPER_ADMIN' || role === 'FINANCE';
  const canReviewTransfers = role === 'SUPER_ADMIN' || role === 'OPERATOR';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if ((tab === 'wallet' || tab === 'equity') && keyword.trim()) params.set('keyword', keyword.trim());
      const path: Record<AssetTab, string> = {
        wallet: '/admin/wallets',
        equity: '/admin/equity/accounts',
        lots: '/admin/equity/expired',
        walletTransfers: '/admin/transfers',
        equityTransfers: '/admin/equity/transfers',
        tokens: '/admin/tokens',
      };
      const raw = await api<any>(`${path[tab]}?${params.toString()}`);
      setData(Array.isArray(raw) ? raw : (raw.list ?? []));
      setTotal(Array.isArray(raw) ? undefined : raw.total);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '资产数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, page, tab]);

  useEffect(() => { void load(); }, [load]);

  const loadLedger = async (userId: string, pageNumber: number) => {
    setLedger([]);
    setLedgerLoading(true);
    try {
      const result = await api<{ list: any[]; total: number }>(`/admin/wallets/${userId}/transactions?page=${pageNumber}`);
      setLedger(result.list ?? []);
      setLedgerTotal(result.total ?? 0);
      setLedgerPage(pageNumber);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '钱包流水加载失败');
    } finally {
      setLedgerLoading(false);
    }
  };

  const openLedger = async (row: any) => {
    setLedgerUser({ id: String(row.userId), name: row.user?.nickname ?? '会员', phone: row.user?.phone });
    setLedgerTotal(0);
    await loadLedger(String(row.userId), 1);
  };

  const openLots = async (row: any) => {
    setLotUser({ id: row.userId, name: row.user?.nickname ?? '会员', phone: row.user?.phone });
    setLots([]);
    setLotsLoading(true);
    try {
      setLots(await api<any[]>(`/admin/equity/${row.userId}/lots`));
    } catch (e) {
      setToast(e instanceof Error ? e.message : '权益值批次加载失败');
    } finally {
      setLotsLoading(false);
    }
  };

  const submitAdjust = async () => {
    if (!adjust || !reason.trim() || !amount || !Number.isSafeInteger(Number(amount)) || Number(amount) === 0) return;
    try {
      const isWallet = adjust.asset === 'wallet';
      await post(`/admin/${isWallet ? `wallets/${adjust.userId}/adjust` : `equity/${adjust.userId}/adjust`}`, {
        amount: Number(amount), reason: reason.trim(),
      });
      setToast('调整成功，流水与审计已记录');
      setAdjust(null);
      setAmount('');
      setReason('');
      void load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '调整失败');
    }
  };

  const reviewTransfer = async (row: TransferRow, action: 'APPROVE' | 'REJECT') => {
    const actionLabel = action === 'APPROVE' ? '通过' : '拒绝';
    const agreed = await confirm({
      title: `确认${actionLabel}该笔转账？`,
      description: `转账单号 ${row.transferNo}，金额 ${fmtMoney(row.amount)}。审核结果会同步通知双方会员。`,
      confirmText: `确认${actionLabel}`,
      tone: action === 'REJECT' ? 'danger' : 'primary',
    });
    if (!agreed) return;
    setBusyTransfer(row.id);
    try {
      const platform = tab === 'walletTransfers' ? 'wallet' : 'equity';
      await post(`/admin/transfers/${row.id}/review`, { action, platform });
      setToast(`转账已${actionLabel}`);
      void load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '转账审核失败');
    } finally {
      setBusyTransfer(null);
    }
  };

  const showSearch = tab === 'wallet' || tab === 'equity';

  return (
    <>
      <PageHeader
        title="资产管理"
        description="统一查看钱包、权益值批次、双向转账与数权账目；资金调整保留流水和审计记录"
        action={(
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新
          </Button>
        )}
      />

      <Card className="overflow-hidden">
        <div className="px-4 pt-1">
          <Tabs
            items={TABS.map((item) => ({ value: item.key, label: item.label }))}
            value={tab}
            onChange={(value) => { setPage(1); setTab(value as AssetTab); }}
          />
        </div>

        <FilterBar>
          {showSearch ? (
            <SearchField
              className="w-full sm:w-[280px]"
              placeholder="搜索手机号 / 昵称"
              value={keyword}
              onChange={(event) => { setPage(1); setKeyword(event.target.value); }}
            />
          ) : (
            <span className="text-xs text-ink-muted">按业务类型查看对应资产记录</span>
          )}
          <div className="ml-auto text-xs text-ink-faint">
            按最新记录排序 · 每页最多 {PAGE_SIZE} 条
          </div>
        </FilterBar>

        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : data.length === 0 ? (
          <Empty
            text={showSearch && keyword ? '没有找到符合条件的账户' : '暂无相关资产记录'}
            description={showSearch && keyword ? '请调整搜索关键词后重试。' : undefined}
          />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {tab === 'wallet' && <>
                    <th className="th">会员</th><th className="th text-right">账户余额</th><th className="th text-right">冻结金额</th>
                    <th className="th text-right">可用余额</th><th className="th text-right">累计入账 / 出账</th><th className="th text-right">操作</th>
                  </>}
                  {tab === 'equity' && <>
                    <th className="th">会员</th><th className="th text-right">可用权益值</th><th className="th text-right">累计发放</th>
                    <th className="th text-right">已消费</th><th className="th text-right">已过期</th><th className="th text-right">操作</th>
                  </>}
                  {tab === 'lots' && <>
                    <th className="th">会员 ID</th><th className="th text-right">批次总额</th><th className="th text-right">剩余额度</th>
                    <th className="th">到期时间</th><th className="th">批次状态</th>
                  </>}
                  {(tab === 'walletTransfers' || tab === 'equityTransfers') && <>
                    <th className="th">转账单号</th><th className="th">转出会员</th><th className="th">转入会员</th>
                    <th className="th text-right">金额</th><th className="th">审核状态</th><th className="th">提交时间</th><th className="th text-right">操作</th>
                  </>}
                  {tab === 'tokens' && <>
                    <th className="th">会员 ID</th><th className="th text-right">当前数权</th><th className="th text-right">累计获得</th>
                    <th className="th text-right">累计转入 / 转出</th><th className="th">账目性质</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {data.map((row: any, index) => (
                  <tr key={row.id ?? row.userId ?? index} className="admin-row">
                    {tab === 'wallet' && <>
                      <td className="td"><MemberName row={row} /></td>
                      <td className="td num text-right font-medium text-ink">{fmtMoney(row.balance)}</td>
                      <td className="td num text-right text-warning">{fmtMoney(row.frozen)}</td>
                      <td className="td num text-right font-medium text-success">{fmtMoney(Number(row.balance) - Number(row.frozen))}</td>
                      <td className="td num text-right text-xs text-ink-muted">{fmtMoney(row.totalIn)} / {fmtMoney(row.totalOut)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-0.5">
                          <Button size="xs" variant="ghost" className="text-accent-ink" onClick={() => void openLedger(row)}>
                            <FileClock size={13} />流水
                          </Button>
                          {canManageFunds && (
                            <Button size="xs" variant="ghost" className="text-accent-ink" onClick={() => { setAmount(''); setReason(''); setAdjust({ userId: row.userId, name: row.user?.nickname, asset: 'wallet' }); }}>
                              调整
                            </Button>
                          )}
                        </div>
                      </td>
                    </>}
                    {tab === 'equity' && <>
                      <td className="td"><MemberName row={row} /></td>
                      <td className="td num text-right font-medium text-info">{fmtMoney(row.balance)}</td>
                      <td className="td num text-right">{fmtMoney(row.totalGranted)}</td>
                      <td className="td num text-right">{fmtMoney(row.totalUsed)}</td>
                      <td className="td num text-right text-warning">{fmtMoney(row.totalExpired)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-0.5">
                          <Button size="xs" variant="ghost" className="text-accent-ink" onClick={() => void openLots(row)}>
                            <Clock3 size={13} />批次
                          </Button>
                          {canManageFunds && (
                            <Button size="xs" variant="ghost" className="text-accent-ink" onClick={() => { setAmount(''); setReason(''); setAdjust({ userId: row.userId, name: row.user?.nickname, asset: 'equity' }); }}>
                              调整
                            </Button>
                          )}
                        </div>
                      </td>
                    </>}
                    {tab === 'lots' && <>
                      <td className="td mono text-xs text-ink-muted">{row.userId}</td>
                      <td className="td num text-right">{fmtMoney(row.amount)}</td>
                      <td className="td num text-right">{fmtMoney(row.remaining)}</td>
                      <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(row.expireAt)}</td>
                      <td className="td"><Badge tone="warning">已过期</Badge></td>
                    </>}
                    {(tab === 'walletTransfers' || tab === 'equityTransfers') && <>
                      <td className="td mono text-xs text-ink-muted">{row.transferNo}</td>
                      <td className="td"><MemberName row={row.fromUser ?? { id: row.fromUserId }} /></td>
                      <td className="td"><MemberName row={row.toUser ?? { id: row.toUserId }} /></td>
                      <td className="td num text-right font-medium text-ink">{fmtMoney(row.amount)}</td>
                      <td className="td">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={TRANSFER_STATUS[row.status]?.tone ?? 'neutral'} dot>
                            {TRANSFER_STATUS[row.status]?.label ?? row.status}
                          </Badge>
                          {row.riskFlag === 1 && <Badge tone="danger">风险复核</Badge>}
                        </div>
                      </td>
                      <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(row.createdAt)}</td>
                      <td className="td">
                        {row.status === 'PENDING' && row.riskFlag === 1 && canReviewTransfers ? (
                          <div className="flex justify-end gap-0.5">
                            <Button size="xs" variant="ghost" className="text-success" disabled={busyTransfer === row.id} onClick={() => void reviewTransfer(row, 'APPROVE')}>
                              <Check size={13} />通过
                            </Button>
                            <Button size="xs" variant="ghost" className="hover:text-danger" disabled={busyTransfer === row.id} onClick={() => void reviewTransfer(row, 'REJECT')}>
                              <X size={13} />拒绝
                            </Button>
                          </div>
                        ) : <span className="block text-right text-xs text-ink-faint">—</span>}
                      </td>
                    </>}
                    {tab === 'tokens' && <>
                      <td className="td mono text-xs text-ink-muted">{row.userId}</td>
                      <td className="td num text-right font-medium text-ink">{fmtMoney(row.balance)}</td>
                      <td className="td num text-right">{fmtMoney(row.totalGranted)}</td>
                      <td className="td num text-right text-xs text-ink-muted">{fmtMoney(row.totalTransferIn)} / {fmtMoney(row.totalTransferOut)}</td>
                      <td className="td"><Badge tone="neutral">可互转</Badge></td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          disabled={loading}
          hasNext={data.length >= PAGE_SIZE}
          onChange={setPage}
        />
      </Card>

      <Modal
        open={!!adjust}
        onClose={() => setAdjust(null)}
        title={adjust?.asset === 'equity' ? '权益值调整' : '钱包余额调整'}
        description={adjust ? `${adjust.name ?? '会员'} · ID ${adjust.userId}` : undefined}
        footer={(
          <>
            <Button onClick={() => setAdjust(null)}>取消</Button>
            <Button
              variant="primary"
              disabled={!reason.trim() || !amount || !Number.isSafeInteger(Number(amount)) || Number(amount) === 0}
              onClick={() => void submitAdjust()}
            >
              确认调整
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <div className="notice notice-warning">
            资金调整将产生不可撤销的账务流水，请核对金额并填写可追溯的原因。
          </div>
          <Field label="调整金额（整数；负数为扣减）" required>
            <input
              className="input"
              type="number"
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="例如 100 或 -100"
            />
          </Field>
          <Field label="操作原因" required>
            <TextInput
              className="input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="填写审计记录所需的业务原因"
            />
          </Field>
        </div>
      </Modal>

      <Drawer
        open={!!ledgerUser}
        onClose={() => setLedgerUser(null)}
        width={880}
        title="钱包流水"
        description={ledgerUser ? `${ledgerUser.name} · ${ledgerUser.phone ?? '—'} · ID ${ledgerUser.id}` : undefined}
      >
        {ledgerLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : ledger.length === 0 ? (
          <Empty text="暂无钱包流水" description="该会员还没有产生资金变动记录。" />
        ) : (
          <Card className="overflow-hidden">
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="th">类型</th><th className="th text-right">变动金额</th><th className="th text-right">变动后余额</th>
                    <th className="th">业务单号</th><th className="th">说明</th><th className="th">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((row) => (
                    <tr key={row.id} className="admin-row">
                      <td className="td">
                        <Badge tone={Number(row.changeAmount) >= 0 ? 'success' : 'warning'}>
                          {LEDGER_TYPE[row.type] ?? '其他'}
                        </Badge>
                      </td>
                      <td className={`td num text-right font-medium ${Number(row.changeAmount) >= 0 ? 'text-success' : 'text-danger'}`}>
                        {Number(row.changeAmount) > 0 ? '+' : ''}{fmtMoney(row.changeAmount)}
                      </td>
                      <td className="td num text-right text-ink">{fmtMoney(row.balanceAfter)}</td>
                      <td className="td mono text-xs text-ink-muted">{row.bizId}</td>
                      <td className="td text-xs text-ink-muted">{row.remark ?? row.bizType}</td>
                      <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={ledgerPage}
              total={ledgerTotal}
              pageSize={PAGE_SIZE}
              onChange={(next) => void loadLedger(ledgerUser.id, next)}
            />
          </Card>
        )}
      </Drawer>

      <Drawer
        open={!!lotUser}
        onClose={() => setLotUser(null)}
        width={760}
        title="权益值批次"
        description={lotUser ? `${lotUser.name} · ${lotUser.phone ?? '—'} · ID ${lotUser.id}` : undefined}
      >
        {lotsLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : lots.length === 0 ? (
          <Empty text="暂无权益值批次" />
        ) : (
          <div className="table-wrap rounded-lg border border-line">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th">批次 ID</th><th className="th text-right">发放总额</th><th className="th text-right">剩余额度</th>
                  <th className="th">发放时间</th><th className="th">到期时间</th><th className="th">状态</th>
                </tr>
              </thead>
              <tbody>
                {lots.map((row) => (
                  <tr key={row.id} className="admin-row">
                    <td className="td mono text-xs text-ink-muted">{row.id}</td>
                    <td className="td num text-right">{fmtMoney(row.amount)}</td>
                    <td className="td num text-right font-medium text-ink">{fmtMoney(row.remaining)}</td>
                    <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(row.createdAt)}</td>
                    <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(row.expireAt)}</td>
                    <td className="td">
                      <Badge tone={row.status === 'EXPIRED' ? 'warning' : row.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {({ ACTIVE: '有效', EXPIRED: '已过期', DEPLETED: '已用完' } as Record<string, string>)[row.status] ?? row.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>

      {confirmNode}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

function MemberName({ row }: { row: any }) {
  return (
    <div>
      <div className="text-sm text-ink">{row.user?.nickname ?? row.nickname ?? `会员 ${row.id ?? ''}`}</div>
      <div className="mt-0.5 mono text-2xs text-ink-faint">{row.user?.phone ?? row.phone ?? ''}</div>
    </div>
  );
}
