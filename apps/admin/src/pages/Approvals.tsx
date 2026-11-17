import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { api, fmtDate, fmtMoney, getAdminRole, post } from '../api';
import {
  Badge, Button, Card, Empty, ErrorBlock, Field, KeyValue, LoadingBlock, Modal, PageHeader, Pagination,
  Tabs, TextInput, Toast, useConfirm,
} from '../components/ui';

const TYPE_NAMES: Record<string, string> = {
  RANK_ADJUST: '等级调整', BONUS_ADJUST: '奖金调整',
  SETTLEMENT_RERUN: '日结重跑', REBIND: '关系换绑',
};
const RANK_NAMES = ['普通会员', '业务主任', '业务经理', '业务总监', '业务副总', '业务总经理', '业务总裁'];
const PAGE_SIZE = 20;

const STATUS_META: Record<string, { label: string; tone: 'warning' | 'success' | 'danger' }> = {
  PENDING: { label: '待复核', tone: 'warning' },
  APPROVED: { label: '已通过', tone: 'success' },
  REJECTED: { label: '已拒绝', tone: 'danger' },
};

export function Approvals() {
  const canReview = ['SUPER_ADMIN', 'FINANCE'].includes(getAdminRole() ?? '');
  const isOperator = getAdminRole() === 'OPERATOR';
  const [tab, setTab] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [reviewRemark, setReviewRemark] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<any>(`/admin/approvals?status=${tab}&page=${page}`);
      setList(result.list ?? []);
      setTotal(result.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '审批列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [page, tab]);

  useEffect(() => { void load(); }, [load]);

  const review = async (id: string, pass: boolean) => {
    if (!pass && !reviewRemark.trim()) {
      setToast('拒绝申请时请填写处理原因');
      return;
    }
    const approval = list.find((item) => item.id === id) ?? selectedApproval;
    const agreed = await confirm({
      title: pass ? '确认通过该申请？' : '确认拒绝该申请？',
      description: `${TYPE_NAMES[approval?.type] ?? '业务申请'} · ${approval?.applicant?.nickname ?? approval?.applicant?.phone ?? '申请人'}。${pass ? '通过后会立即执行对应业务变更。' : `拒绝原因：${reviewRemark.trim()}`}`,
      confirmText: pass ? '确认通过并执行' : '确认拒绝申请',
      tone: pass ? 'primary' : 'danger',
      confirmationText: `${pass ? '通过' : '拒绝'}申请 ${approval?.id ?? id}`,
    });
    if (!agreed) return;
    setReviewBusy(true);
    try {
      await post(`/admin/approvals/${id}/review`, { pass, remark: reviewRemark.trim() || '复核通过' });
      setToast(pass ? '已复核通过并执行' : '已拒绝申请');
      setSelectedApproval(null);
      setReviewRemark('');
      void load();
    } catch (e: any) {
      setToast(e.message);
    } finally {
      setReviewBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="审批中心"
        description={isOperator ? '跟踪本人提交的等级、奖金、日结与关系换绑申请' : '复核运营提交的等级、奖金、日结与关系换绑申请'}
      />

      <Card className="overflow-hidden">
        <div className="px-4 pt-1">
          <Tabs
            items={[
              { value: 'PENDING', label: '待复核' },
              { value: 'APPROVED', label: '已通过' },
              { value: 'REJECTED', label: '已拒绝' },
              { value: '', label: '全部' },
            ]}
            value={tab}
            onChange={(value) => { setPage(1); setTab(value); }}
          />
        </div>

        {error ? (
          <ErrorBlock text={`审批列表加载失败：${error}`} action={<Button size="sm" onClick={() => void load()}>重试</Button>} />
        ) : loading ? (
          <LoadingBlock text="正在加载审批申请…" />
        ) : list.length === 0 ? (
          <Empty
            text={`${tab === 'PENDING' ? '暂无待复核申请' : '暂无审批记录'}`}
            description={tab === 'PENDING' ? '运营提交的等级、奖金、日结与换绑申请会进入这里。' : undefined}
            icon={<ClipboardCheck size={18} />}
          />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th">ID</th>
                  <th className="th">类型</th>
                  <th className="th">申请人</th>
                  <th className="th">申请说明</th>
                  <th className="th">状态</th>
                  <th className="th">提交时间</th>
                  <th className="th text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a.id} className="admin-row">
                    <td className="td mono text-xs text-ink-muted">#{a.id}</td>
                    <td className="td"><Badge tone="brand">{TYPE_NAMES[a.type] ?? a.type}</Badge></td>
                    <td className="td">
                      <div className="text-sm text-ink">{a.applicantRole}</div>
                      <div className="text-2xs text-ink-faint">ID {a.applicantId}</div>
                    </td>
                    <td className="td max-w-[320px] truncate text-xs text-ink-muted">
                      {a.remark || `${TYPE_NAMES[a.type] ?? '业务申请'} · ${Object.keys(a.payload ?? {}).length} 项参数`}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_META[a.status]?.tone ?? 'warning'} dot>
                        {STATUS_META[a.status]?.label ?? a.status}
                      </Badge>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-ink-muted">{fmtDate(a.createdAt)}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        {a.status === 'PENDING' && isOperator && <span className="text-2xs text-ink-faint">等待财务复核</span>}
                        {a.status !== 'PENDING' && (
                          <span className="text-2xs text-ink-faint">{a.reviewerId ? `复核人 ${a.reviewerId}` : '—'}</span>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-accent-ink"
                          onClick={() => { setSelectedApproval(a); setReviewRemark(''); }}
                        >
                          查看详情
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={total} pageSize={PAGE_SIZE} disabled={loading} onChange={setPage} unit="条申请" />
      </Card>

      <Modal
        open={!!selectedApproval}
        onClose={() => setSelectedApproval(null)}
        title="审批申请详情"
        description={selectedApproval ? <span className="mono">申请 #{selectedApproval.id}</span> : undefined}
        size="lg"
        footer={selectedApproval?.status === 'PENDING' && canReview ? (
          <>
            <Button variant="danger-soft" disabled={reviewBusy} onClick={() => void review(selectedApproval.id, false)}>
              <XCircle size={14} />拒绝申请
            </Button>
            <Button variant="primary" disabled={reviewBusy} onClick={() => void review(selectedApproval.id, true)}>
              <CheckCircle2 size={14} />{reviewBusy ? '处理中…' : '通过并执行'}
            </Button>
          </>
        ) : (
          <Button onClick={() => setSelectedApproval(null)}>关闭</Button>
        )}
      >
        {selectedApproval && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{TYPE_NAMES[selectedApproval.type] ?? selectedApproval.type}</Badge>
              <Badge tone={STATUS_META[selectedApproval.status]?.tone ?? 'warning'} dot>
                {STATUS_META[selectedApproval.status]?.label ?? selectedApproval.status}
              </Badge>
              <span className="text-xs text-ink-faint">提交于 {fmtDate(selectedApproval.createdAt)}</span>
            </div>

            <div className="subtle-panel grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
              <KeyValue label="申请人" value={`${selectedApproval.applicantRole} · ID ${selectedApproval.applicantId}`} />
              <KeyValue label="申请备注" value={selectedApproval.remark ?? '—'} />
              {selectedApproval.targetUser && (
                <KeyValue
                  label="目标会员"
                  value={`${selectedApproval.targetUser.nickname ?? '未设置昵称'} · ${selectedApproval.targetUser.phone ?? '无手机号'} · ID ${selectedApproval.targetUser.id}`}
                />
              )}
              {selectedApproval.type === 'RANK_ADJUST' && (
                <KeyValue label="调整后等级" value={RANK_NAMES[Number(selectedApproval.payload?.level)] ?? `等级 ${selectedApproval.payload?.level}`} />
              )}
              {selectedApproval.type === 'REBIND' && (
                <KeyValue
                  label="新推荐人"
                  value={!selectedApproval.payload?.parentId ? '解除现有关联' : selectedApproval.newParent ? `${selectedApproval.newParent.nickname ?? '未设置昵称'} · ID ${selectedApproval.newParent.id}` : `会员 ID ${selectedApproval.payload.parentId}`}
                />
              )}
              {selectedApproval.type === 'BONUS_ADJUST' && (
                <KeyValue label="奖金金额" value={fmtMoney(selectedApproval.payload?.amount)} />
              )}
            </div>

            <div>
              <div className="mb-2 text-xs font-medium text-ink-soft">申请参数</div>
              <div className="divide-y divide-[var(--line)] rounded-lg border border-line">
                {Object.entries(selectedApproval.payload ?? {})
                  .filter(([key]) => !['userId', 'parentId', 'level', 'amount'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
                      <span className="text-xs text-ink-faint">{( { reason: '调整原因', date: '结算日期' } as Record<string, string>)[key] ?? key}</span>
                      <span className="break-all text-sm text-ink">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            {selectedApproval.status === 'PENDING' && canReview && (
              <Field label="复核意见" hint="通过可留空；拒绝时请说明原因">
                <TextInput
                  className="input"
                  value={reviewRemark}
                  onChange={(event) => setReviewRemark(event.target.value)}
                  placeholder="填写复核意见"
                />
              </Field>
            )}

            {selectedApproval.status === 'PENDING' && isOperator && (
              <div className="notice">申请已提交，财务复核通过后系统会执行相应操作。</div>
            )}
          </div>
        )}
      </Modal>

      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      {confirmNode}
    </>
  );
}
