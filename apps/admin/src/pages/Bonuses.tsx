import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, Coins, Plus, Wallet } from 'lucide-react';
import { api, fmtDate, fmtMoney, getAdminRole, post } from '../api';
import {
  Badge, Button, Card, Empty, ErrorBlock, Field, Modal, PageHeader, Pagination, StatCard, Tabs, TextInput, Toast,
} from '../components/ui';

const BONUS_TYPES = [
  { value: '', label: '全部类型' },
  { value: '1', label: '直推奖' },
  { value: '2', label: '团队奖' },
  { value: '3', label: '平级奖' },
  { value: '4', label: '领导奖' },
  { value: '5', label: '分红池' },
];
const TYPE_META: Record<number, { label: string; tone: 'brand' | 'success' | 'warning' | 'danger' | 'info' }> = {
  1: { label: '直推奖', tone: 'brand' },
  2: { label: '团队奖', tone: 'success' },
  3: { label: '平级奖', tone: 'warning' },
  4: { label: '领导奖', tone: 'danger' },
  5: { label: '分红池', tone: 'info' },
};
const PAGE_SIZE = 20;

export function Bonuses() {
  const [records, setRecords] = useState<any[]>([]);
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberOptions, setMemberOptions] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [saving, setSaving] = useState(false);
  const canAdjust = ['SUPER_ADMIN', 'OPERATOR'].includes(getAdminRole() ?? '');

  const loadRecords = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (type) params.set('type', type);
      const result = await api<any>(`/admin/bonus/records?${params.toString()}`);
      setRecords(Array.isArray(result) ? result : (result.list ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : '奖金明细加载失败');
    }
  }, [page, type]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  useEffect(() => {
    if (!adjustOpen || memberSearch.trim().length < 2 || selectedMember) {
      setMemberOptions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ keyword: memberSearch.trim(), status: '0', page: '1' });
        const result = await api<{ list: any[] }>(`/admin/members?${params.toString()}`);
        setMemberOptions(result.list);
      } catch (e) {
        setMemberOptions([]);
        setToast(e instanceof Error ? e.message : '会员搜索失败');
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [adjustOpen, memberSearch, selectedMember]);

  const submitAdjustment = async () => {
    const amount = Number(adjustAmount);
    if (!selectedMember || !Number.isSafeInteger(amount) || amount <= 0 || !adjustReason.trim()) return;
    setSaving(true);
    try {
      const result = await post<{ direct?: boolean }>('/admin/bonus/adjust', { userId: selectedMember.id, amount, reason: adjustReason.trim() });
      setAdjustOpen(false);
      setMemberSearch(''); setSelectedMember(null); setAdjustAmount(''); setAdjustReason('');
      setToast(result.direct ? '奖金调整已完成并记入流水' : '奖金调整申请已提交，等待财务复核');
      void loadRecords();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '奖金调整失败');
    } finally {
      setSaving(false);
    }
  };

  const totals = records.reduce(
    (acc, r) => {
      acc.amount += Number(r.amount ?? 0);
      acc.cash += Number(r.cashAmount ?? 0);
      acc.token += Number(r.tokenAmount ?? 0);
      return acc;
    },
    { amount: 0, cash: 0, token: 0 },
  );

  const openAdjust = () => {
    setMemberSearch(''); setSelectedMember(null); setAdjustAmount(''); setAdjustReason('');
    setAdjustOpen(true);
  };

  return (
    <>
      <PageHeader
        title="奖金明细"
        description="五条收益线的入账记录与 70/30 拆分结果"
        action={canAdjust ? <Button variant="primary" onClick={openAdjust}><Plus size={15} />发起奖金调整</Button> : undefined}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="当前列表奖金总额" value={fmtMoney(totals.amount)} icon={<CircleDollarSign size={17} />} accent="brand" trend="仅统计当前页记录" />
        <StatCard label="钱包部分（70%）" value={fmtMoney(totals.cash)} icon={<Wallet size={17} />} accent="success" trend="可提现余额入账" />
        <StatCard label="数权部分（30%）" value={fmtMoney(totals.token)} icon={<Coins size={17} />} accent="info" trend="权益值入账" />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 pt-1">
          <Tabs
            items={BONUS_TYPES.map((item) => ({ value: item.value, label: item.label }))}
            value={type}
            onChange={(value) => { setPage(1); setType(value); }}
          />
        </div>

        {error ? (
          <ErrorBlock text={`加载失败：${error}`} action={<Button size="sm" onClick={() => void loadRecords()}>重试</Button>} />
        ) : records.length === 0 ? (
          <Empty text="暂无奖金记录" description="奖金结算后会在这里生成明细。" />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th">收益人</th>
                  <th className="th">类型</th>
                  <th className="th text-right">奖金金额</th>
                  <th className="th text-right">现金 70%</th>
                  <th className="th text-right">数权 30%</th>
                  <th className="th">来源用户</th>
                  <th className="th">结算日</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const meta = TYPE_META[r.type] ?? { label: '奖金', tone: 'neutral' as const };
                  return (
                    <tr key={r.id} className="admin-row">
                      <td className="td">
                        <div className="cell-strong">{r.user?.nickname ?? '—'}</div>
                        {r.user?.phone && <div className="cell-muted mono">{r.user.phone}</div>}
                      </td>
                      <td className="td"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      <td className="td num text-right font-medium text-ink">{fmtMoney(r.amount)}</td>
                      <td className="td num text-right text-success">{fmtMoney(r.cashAmount)}</td>
                      <td className="td num text-right text-info">{fmtMoney(r.tokenAmount)}</td>
                      <td className="td text-xs text-ink-muted">{r.sourceUser?.nickname ?? '—'}</td>
                      <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(r.settleDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} pageSize={PAGE_SIZE} hasNext={records.length >= PAGE_SIZE} onChange={setPage} />
      </Card>

      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="奖金手工调整"
        description="调整记录会同步写入奖金明细、钱包流水和审计日志。"
        footer={(
          <>
            <Button onClick={() => setAdjustOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!selectedMember || !Number.isSafeInteger(Number(adjustAmount)) || Number(adjustAmount) <= 0 || !adjustReason.trim() || saving}
              onClick={() => void submitAdjustment()}
            >
              {saving ? '处理中…' : getAdminRole() === 'SUPER_ADMIN' ? '确认调整' : '提交财务复核'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Field label="目标会员">
            <div className="relative">
              <TextInput
                className="input"
                value={memberSearch}
                onChange={(event) => { setMemberSearch(event.target.value); setSelectedMember(null); }}
                placeholder="搜索会员昵称、手机号或邀请码"
              />
              {memberSearch.trim().length >= 2 && !selectedMember && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-pop">
                  {searching ? (
                    <div className="px-3 py-2 text-xs text-ink-faint">正在搜索会员…</div>
                  ) : memberOptions.length ? (
                    memberOptions.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition hover:bg-hover"
                        onClick={() => {
                          setSelectedMember(member);
                          setMemberSearch(`${member.nickname ?? '会员'} · ${member.phone ?? member.inviteCode}`);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{member.nickname ?? '未设置昵称'}</span>
                          <span className="mt-0.5 block mono text-2xs text-ink-faint">{member.phone ?? member.inviteCode}</span>
                        </span>
                        <span className="shrink-0 text-2xs text-ink-faint">ID {member.id}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-ink-faint">没有找到正常状态的会员</div>
                  )}
                </div>
              )}
            </div>
            {selectedMember && (
              <div className="mt-1.5 text-2xs text-accent-ink">已选择：{selectedMember.nickname ?? '会员'}（ID {selectedMember.id}）</div>
            )}
          </Field>
          <Field label="奖金金额" required hint="仅支持正整数金额，正向入账">
            <input
              className="input"
              type="number"
              min="1"
              step="1"
              value={adjustAmount}
              onChange={(event) => setAdjustAmount(event.target.value)}
              placeholder="请输入正整数"
            />
          </Field>
          <Field label="调整原因" required>
            <textarea
              className="textarea"
              value={adjustReason}
              onChange={(event) => setAdjustReason(event.target.value)}
              placeholder="填写业务原因，作为复核与审计依据"
            />
          </Field>
          <div className="notice notice-warning">
            运营提交后由财务复核，超管操作立即生效。调整仅支持正向奖金入账。
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
