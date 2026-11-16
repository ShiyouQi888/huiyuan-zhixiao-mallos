import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ChevronRight, CircleDollarSign, GitBranch, KeyRound, Pencil, Plus, RefreshCw, ShieldOff, Trash2, TrendingUp, UserRound, Wallet,
} from 'lucide-react';
import { api, fmtDate, fmtMoney, getAdminRole, post, put } from '../api';
import type { Member } from '../types';
import {
  Badge, Button, Card, CardHeader, Drawer, Empty, Field, FilterBar, KeyValue, LoadingBlock,
  Modal, PageHeader, Pagination, SearchField, SelectField, TableSkeleton, Tabs, TextInput, Toast, useConfirm,
} from '../components/ui';

const RANK_NAMES = ['普通会员', '业务主任', '业务经理', '业务总监', '业务副总', '业务总经理', '业务总裁'];
const PACKAGE_NAMES: Record<number, string> = { 1: '银卡', 2: '金卡', 3: '钻卡', 4: '至尊卡' };
const PAGE_SIZE = 20;

interface MemberTreeNode {
  id: string;
  nickname: string | null;
  phone: string | null;
  rankLevel: number;
  depth: number;
  packageId: number | null;
  children: MemberTreeNode[];
}

interface MemberProfile extends Omit<Member, 'wallet' | 'equityAccount'> {
  id: string;
  packageExpireAt?: string | null;
  depth: number;
  realNameStatus: number;
  parent?: { id: string; nickname: string | null; phone: string | null } | null;
  rank?: { name: string; level: number } | null;
  package?: { name: string; level: number; price: number } | null;
  wallet?: { balance: number; frozen: number; totalIn: number; totalOut: number } | null;
  equityAccount?: { balance: number; totalGranted: number; totalUsed: number; totalExpired: number } | null;
}

function countDescendants(node: MemberTreeNode): number {
  return node.children.reduce((count, child) => count + 1 + countDescendants(child), 0);
}

function TeamTreeNode({ node, root = false, rankLabels = {} }: { node: MemberTreeNode; root?: boolean; rankLabels?: Record<number, string> }) {
  const label = node.nickname || `会员 ${node.id}`;
  const content = (
    <div className={`flex min-w-0 items-center gap-3 rounded-lg px-3 py-2.5 ${root ? 'bg-accent-soft' : 'transition hover:bg-hover'}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-panel text-accent-ink ring-1 ring-[var(--line)]">
        <UserRound size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">
          {label}
          {root && <span className="badge badge-brand ml-2 align-middle">当前会员</span>}
        </div>
        <div className="mt-0.5 truncate mono text-2xs text-ink-faint">{node.phone ?? '—'}</div>
      </div>
      <span className="shrink-0 rounded-md bg-panel px-2 py-0.5 text-2xs text-ink-muted ring-1 ring-[var(--line)]">
        {rankLabels[node.rankLevel] ?? RANK_NAMES[node.rankLevel] ?? `等级 ${node.rankLevel}`}
      </span>
      <span className="shrink-0 text-2xs text-ink-faint">{node.children.length} 位直推</span>
    </div>
  );

  if (node.children.length === 0) return content;
  return (
    <details open={root} className="group">
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <div className="flex cursor-pointer items-center gap-1.5">
          <ChevronRight size={14} className="shrink-0 text-ink-faint transition-transform group-open:rotate-90" />
          {content}
        </div>
      </summary>
      <div className="ml-3 mt-1 space-y-1 border-l border-line pl-3">
        {node.children.map((child) => <TeamTreeNode key={child.id} node={child} rankLabels={rankLabels} />)}
      </div>
    </details>
  );
}

export function Members() {
  const [list, setList] = useState<Member[]>([]);
  const [ranks, setRanks] = useState<Array<{ level: number; name: string; status: number }>>([]);
  const [keyword, setKeyword] = useState('');
  const [rankFilter, setRankFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Member | null>(null);
  const [level, setLevel] = useState(0);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [teamTree, setTeamTree] = useState<MemberTreeNode | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [rebindOpen, setRebindOpen] = useState(false);
  const [newParentId, setNewParentId] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [parentCandidates, setParentCandidates] = useState<Member[]>([]);
  const [selectedParent, setSelectedParent] = useState<Member | null>(null);
  const [parentSearching, setParentSearching] = useState(false);
  const [rebindReason, setRebindReason] = useState('');
  const [rebindBusy, setRebindBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({ nickname: '', phone: '', password: '', referrer: '' });
  const [managedMember, setManagedMember] = useState<Member | null>(null);
  const [manageTab, setManageTab] = useState<'profile' | 'security' | 'wallet' | 'danger'>('profile');
  const [manageBusy, setManageBusy] = useState(false);
  const [manageForm, setManageForm] = useState({ nickname: '', phone: '', password: '', amount: '', rechargeReason: '', deleteReason: '' });
  const [toast, setToast] = useState('');
  const { confirm, confirmNode } = useConfirm();
  const role = getAdminRole();
  const canManageMembers = role === 'SUPER_ADMIN' || role === 'OPERATOR';
  const canRecharge = role === 'SUPER_ADMIN' || role === 'FINANCE';
  const canDeleteMembers = role === 'SUPER_ADMIN';
  const rankName = (rankLevel: number) => ranks.find((rank) => rank.level === rankLevel)?.name ?? RANK_NAMES[rankLevel] ?? `等级 ${rankLevel}`;
  const createFormValid = createForm.nickname.trim().length >= 2
    && /^1[3-9]\d{9}$/.test(createForm.phone)
    && createForm.password.length >= 8;
  const manageProfileValid = manageForm.nickname.trim().length >= 2 && /^1[3-9]\d{9}$/.test(manageForm.phone);
  const rechargeFormValid = Number.isSafeInteger(Number(manageForm.amount)) && Number(manageForm.amount) > 0
    && manageForm.rechargeReason.trim().length >= 2;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (keyword.trim()) params.set('keyword', keyword.trim());
    if (rankFilter !== 'all') params.set('rankLevel', rankFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    api<{ list: Member[]; total: number }>(`/admin/members?${params.toString()}`)
      .then((r) => { setList(r.list); setTotal(r.total); })
      .catch((e) => setToast(e.message))
      .finally(() => setLoading(false));
  }, [keyword, page, rankFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    api<Array<{ level: number; name: string; status: number }>>('/admin/members/options/ranks')
      .then(setRanks)
      .catch((e) => setToast(e.message));
  }, []);

  useEffect(() => {
    if (!rebindOpen || parentSearch.trim().length < 2 || selectedParent) {
      setParentCandidates([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setParentSearching(true);
      try {
        const params = new URLSearchParams({ page: '1', status: '0', keyword: parentSearch.trim() });
        const result = await api<{ list: Member[] }>(`/admin/members?${params.toString()}`);
        setParentCandidates(result.list.filter((candidate) => candidate.id !== profile?.id && candidate.id !== profile?.parent?.id));
      } catch (e) {
        setParentCandidates([]);
        setToast(e instanceof Error ? e.message : '推荐人搜索失败');
      } finally {
        setParentSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [parentSearch, profile, rebindOpen, selectedParent]);

  const adjust = async () => {
    if (!target) return;
    try {
      const result = await post<{ direct?: boolean }>(`/admin/members/${target.id}/rank`, { level });
      setToast(result.direct ? `已将 ${target.nickname ?? '会员'} 调整为${rankName(level)}` : `${target.nickname ?? '会员'} 的等级调整申请已提交，等待财务复核`);
      setTarget(null);
      load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '调整失败');
    }
  };

  const toggleFreeze = async (m: Member) => {
    if (m.status === 2) return;
    const action = m.status === 0 ? '冻结' : '解冻';
    const agreed = await confirm({
      title: `确定${action}该会员账号？`,
      description: `${m.nickname ?? '未设置昵称'} · ${m.phone ?? m.inviteCode}。${m.status === 0 ? '冻结后会员将无法登录与下单。' : '解冻后账号将恢复正常使用。'}`,
      confirmText: `确认${action}`,
      tone: m.status === 0 ? 'danger' : 'primary',
    });
    if (!agreed) return;
    try {
      await post(`/admin/members/${m.id}/freeze`, { frozen: m.status === 0 });
      setToast(m.status === 0 ? '账号已冻结' : '账号已解冻');
      load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '操作失败');
    }
  };

  const createMember = async () => {
    if (createBusy) return;
    setCreateBusy(true);
    try {
      const created = await post<{ nickname: string; phone: string; inviteCode: string }>('/admin/members', createForm);
      setToast(`会员已创建 · ${created.nickname} · 邀请码 ${created.inviteCode}`);
      setCreateOpen(false);
      setCreateForm({ nickname: '', phone: '', password: '', referrer: '' });
      if (page !== 1) setPage(1);
      else load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '创建会员失败');
    } finally {
      setCreateBusy(false);
    }
  };

  const openManagement = (member: Member) => {
    setManagedMember(member);
    setManageTab(canManageMembers ? 'profile' : 'wallet');
    setManageForm({ nickname: member.nickname ?? '', phone: member.phone ?? '', password: '', amount: '', rechargeReason: '', deleteReason: '' });
  };

  const updateMemberProfile = async () => {
    if (!managedMember || manageBusy) return;
    setManageBusy(true);
    try {
      await put(`/admin/members/${managedMember.id}`, { nickname: manageForm.nickname, phone: manageForm.phone });
      setToast('会员资料已更新');
      setManagedMember(null);
      load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '资料更新失败');
    } finally {
      setManageBusy(false);
    }
  };

  const resetMemberPassword = async () => {
    if (!managedMember || manageBusy) return;
    setManageBusy(true);
    try {
      await put(`/admin/members/${managedMember.id}/password`, { password: manageForm.password });
      setToast('登录密码已重设，该会员的其他登录会话已撤销');
      setManageForm((form) => ({ ...form, password: '' }));
    } catch (e) {
      setToast(e instanceof Error ? e.message : '密码重设失败');
    } finally {
      setManageBusy(false);
    }
  };

  const rechargeMemberWallet = async () => {
    if (!managedMember || manageBusy) return;
    setManageBusy(true);
    try {
      await post(`/admin/members/${managedMember.id}/wallet/recharge`, { amount: Number(manageForm.amount), reason: manageForm.rechargeReason });
      setToast(`已为 ${managedMember.nickname ?? '会员'} 钱包充值 ¥${Number(manageForm.amount).toLocaleString('zh-CN')}`);
      setManageForm((form) => ({ ...form, amount: '', rechargeReason: '' }));
      load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '钱包充值失败');
    } finally {
      setManageBusy(false);
    }
  };

  const deleteMember = async () => {
    if (!managedMember || manageBusy) return;
    if (manageForm.deleteReason.trim().length < 2) {
      setToast('请填写注销原因（至少 2 个字符）');
      return;
    }
    const agreed = await confirm({
      title: '注销该会员账号？',
      description: `将停用 ${managedMember.nickname ?? '该会员'}（${managedMember.phone ?? managedMember.inviteCode}）并撤销所有登录会话。订单、团队关系、钱包与权益流水都会保留用于审计。`,
      confirmText: '确认注销账号',
      tone: 'danger',
    });
    if (!agreed) return;
    setManageBusy(true);
    try {
      await post(`/admin/members/${managedMember.id}/delete`, { reason: manageForm.deleteReason });
      setToast('会员账号已注销，业务历史已保留');
      setManagedMember(null);
      load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : '账号注销失败');
    } finally {
      setManageBusy(false);
    }
  };

  const openMemberDetail = async (member: Member) => {
    setSelectedMember(member);
    setProfile(null);
    setTeamTree(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const [detail, tree] = await Promise.all([
        api<MemberProfile>(`/admin/members/${member.id}`),
        api<MemberTreeNode>(`/admin/members/${member.id}/team`),
      ]);
      setProfile(detail);
      setTeamTree(tree);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : '会员详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const submitRebind = async () => {
    if (!profile || !rebindReason.trim()) return;
    if (parentSearch.trim() && !selectedParent) {
      setToast('请从搜索结果中选择推荐人，解除关系时请清空搜索框');
      return;
    }
    const requestedParentId = newParentId.trim();
    if (requestedParentId && !/^\d+$/.test(requestedParentId)) {
      setToast('请输入有效的新推荐人会员 ID');
      return;
    }
    if (requestedParentId === profile.id || (requestedParentId && requestedParentId === profile.parent?.id)) {
      setToast('新推荐人不能与当前会员或现有推荐人相同');
      return;
    }
    setRebindBusy(true);
    try {
      const result = await post<{ direct?: boolean }>(`/admin/members/${profile.id}/rebind`, {
        ...(requestedParentId ? { parentId: requestedParentId } : {}),
        remark: rebindReason.trim(),
      });
      setRebindOpen(false);
      setNewParentId('');
      setRebindReason('');
      setToast(result.direct ? '关系已调整并写入审计记录' : '换绑申请已提交，等待财务复核');
      if (result.direct && selectedMember) void openMemberDetail(selectedMember);
    } catch (e) {
      setToast(e instanceof Error ? e.message : '换绑申请失败');
    } finally {
      setRebindBusy(false);
    }
  };

  const statusLabel = (status: number) => (status === 0 ? '正常' : status === 1 ? '已冻结' : '已注销');

  return (
    <>
      <PageHeader
        title="会员管理"
        description="管理会员资料、等级、账号状态与钱包；敏感操作全程留痕并撤销相关会话"
        action={(
          <>
            {canManageMembers && <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={15} />新增会员</Button>}
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />刷新
            </Button>
          </>
        )}
      />

      <Card className="overflow-hidden">
        <FilterBar>
          <SearchField
            className="w-full sm:w-[280px]"
            placeholder="搜索手机号 / 昵称 / 邀请码"
            value={keyword}
            onChange={(e) => { setPage(1); setKeyword(e.target.value); }}
          />
          <SelectField
            ariaLabel="会员等级筛选"
            className="w-[136px]"
            value={rankFilter}
            onChange={(event) => { setPage(1); setRankFilter(event.target.value); }}
            options={[
              { value: 'all', label: '全部等级' },
              ...ranks.map((rank) => ({ value: String(rank.level), label: `${rank.name}${rank.status === 1 ? '' : '（已停用）'}` })),
            ]}
          />
          <SelectField
            ariaLabel="会员状态筛选"
            className="w-[124px]"
            value={statusFilter}
            onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}
            options={[
              { value: 'all', label: '全部状态' },
              { value: '0', label: '正常' },
              { value: '1', label: '已冻结' },
              { value: '2', label: '已注销' },
            ]}
          />
          {(keyword || rankFilter !== 'all' || statusFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setKeyword(''); setRankFilter('all'); setStatusFilter('all'); setPage(1); }}
            >
              重置筛选
            </Button>
          )}
          <div className="ml-auto text-xs text-ink-faint">
            当前页 {list.length} 位 · 共 <span className="num text-ink-soft">{total.toLocaleString('zh-CN')}</span> 位
          </div>
        </FilterBar>

        {loading && list.length === 0 ? (
          <TableSkeleton rows={7} cols={7} />
        ) : list.length === 0 ? (
          <Empty
            text="没有找到符合条件的会员"
            description="尝试调整关键词或筛选条件后重新查询。"
            action={(
              <Button size="sm" variant="secondary" onClick={() => { setKeyword(''); setRankFilter('all'); setStatusFilter('all'); setPage(1); }}>
                清除筛选
              </Button>
            )}
          />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th">会员</th>
                  <th className="th">邀请码</th>
                  <th className="th">档位</th>
                  <th className="th">等级</th>
                  <th className="th text-right">团队累计业绩</th>
                  <th className="th">钱包 / 权益值</th>
                  <th className="th">状态</th>
                  <th className="th text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="admin-row">
                    <td className="td">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs font-semibold text-accent-ink">
                          {(m.nickname ?? '会')[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="cell-strong truncate">{m.nickname ?? '—'}</div>
                          <div className="cell-muted mono">{m.phone ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="td">
                      <span className="mono text-xs text-accent-ink">{m.inviteCode}</span>
                    </td>
                    <td className="td">
                      {m.packageId
                        ? <span className="text-ink-soft">{PACKAGE_NAMES[m.packageId] ?? '—'}</span>
                        : <span className="text-ink-faint">普通用户</span>}
                    </td>
                    <td className="td">
                      <Badge tone={m.rankLevel > 0 ? 'brand' : 'neutral'}>{rankName(m.rankLevel)}</Badge>
                    </td>
                    <td className="td num text-right font-medium text-ink">{fmtMoney(m.totalTeamPerformance)}</td>
                    <td className="td">
                      <div className="num text-xs text-ink-soft">{fmtMoney(m.wallet?.balance)}</div>
                      <div className="num text-2xs text-ink-faint">权益 {fmtMoney(m.equityAccount?.balance)}</div>
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={m.status === 0 ? 'success' : m.status === 1 ? 'danger' : 'neutral'} dot>
                          {statusLabel(m.status)}
                        </Badge>
                        {m.equityStatus === 1 && <Badge tone="warning">暂停计酬</Badge>}
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button size="xs" variant="ghost" onClick={() => void openMemberDetail(m)}>
                          <UserRound size={13} />详情
                        </Button>
                        {canManageMembers && (
                          <>
                            {m.status !== 2 && <Button size="xs" variant="ghost" onClick={() => { setTarget(m); setLevel(m.rankLevel); }}>
                              <TrendingUp size={13} />调级
                            </Button>}
                            {m.status !== 2 && <Button
                              size="xs"
                              variant="ghost"
                              className="hover:text-danger"
                              onClick={() => void toggleFreeze(m)}
                            >
                              <ShieldOff size={13} />{m.status === 0 ? '冻结' : '解冻'}
                            </Button>}
                          </>
                        )}
                        {(canManageMembers || canRecharge || canDeleteMembers) && (
                          <Button size="xs" variant="ghost" onClick={() => openManagement(m)}>
                            <Pencil size={13} />管理
                          </Button>
                        )}
                      </div>
                    </td>
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
          onChange={setPage}
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新增会员账号"
        description="创建后将自动生成邀请码，并按系统关系规则初始化钱包与权益账户。"
        footer={(
          <>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" disabled={createBusy || !createFormValid} onClick={() => void createMember()}>
              <Plus size={14} />{createBusy ? '创建中…' : '创建会员'}
            </Button>
          </>
        )}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="会员昵称" required>
            <TextInput className="input" value={createForm.nickname} onChange={(event) => setCreateForm({ ...createForm, nickname: event.target.value })} placeholder="请输入 2–64 个字符" />
          </Field>
          <Field label="手机号" required hint="仅支持 11 位大陆手机号">
            <TextInput className="input" type="tel" value={createForm.phone} onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value.replace(/\D/g, '').slice(0, 11) })} placeholder="请输入手机号" />
          </Field>
          <Field label="初始登录密码" required hint="8–64 位；创建后可在账号管理中重设">
            <TextInput className="input" type="password" autoComplete="new-password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} placeholder="设置初始密码" />
          </Field>
          <Field label="推荐人手机号 / 邀请码" hint="选填；留空则创建为独立根会员">
            <TextInput className="input" value={createForm.referrer} onChange={(event) => setCreateForm({ ...createForm, referrer: event.target.value })} placeholder="手机号或邀请码" />
          </Field>
        </div>
        <div className="notice notice-info mt-4">
          <UserRound size={14} />账号按普通会员等级初始化；首次开通礼包、升级与复消由会员端完成。
        </div>
      </Modal>

      <Modal
        open={!!managedMember}
        onClose={() => setManagedMember(null)}
        title={`账号管理 · ${managedMember?.nickname ?? '会员'}`}
        description={`${managedMember?.phone ?? '—'} · 邀请码 ${managedMember?.inviteCode ?? '—'}`}
        size="lg"
      >
        {managedMember?.status === 2 ? (
          <div className="notice notice-warning"><ShieldOff size={14} />该会员账号已注销，账号资料与资金流水仅供审计查阅。</div>
        ) : (
          <>
            <Tabs
              className="mb-4"
              value={manageTab}
              onChange={(value) => setManageTab(value as typeof manageTab)}
              items={[
                ...(canManageMembers ? [{ value: 'profile', label: '基本资料' }, { value: 'security', label: '密码安全' }] : []),
                ...(canRecharge ? [{ value: 'wallet', label: '钱包充值' }] : []),
                ...(canDeleteMembers ? [{ value: 'danger', label: '注销账号' }] : []),
              ]}
            />
            {manageTab === 'profile' && canManageMembers && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="会员昵称" required><TextInput className="input" value={manageForm.nickname} onChange={(event) => setManageForm({ ...manageForm, nickname: event.target.value })} /></Field>
                  <Field label="手机号" required hint="变更手机号后，原登录会话将立即失效"><TextInput className="input" type="tel" value={manageForm.phone} onChange={(event) => setManageForm({ ...manageForm, phone: event.target.value.replace(/\D/g, '').slice(0, 11) })} /></Field>
                </div>
                <div className="flex justify-end"><Button variant="primary" disabled={manageBusy || !manageProfileValid} onClick={() => void updateMemberProfile()}><Pencil size={14} />保存资料</Button></div>
              </div>
            )}
            {manageTab === 'security' && canManageMembers && (
              <div className="space-y-4">
                <Field label="新登录密码" required hint="至少 8 位。保存后将撤销该会员所有已登录设备的会话。">
                  <TextInput className="input" type="password" autoComplete="new-password" value={manageForm.password} onChange={(event) => setManageForm({ ...manageForm, password: event.target.value })} placeholder="输入新的登录密码" />
                </Field>
                <div className="flex justify-end"><Button variant="primary" disabled={manageBusy || manageForm.password.length < 8} onClick={() => void resetMemberPassword()}><KeyRound size={14} />重设登录密码</Button></div>
              </div>
            )}
            {manageTab === 'wallet' && canRecharge && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ProfileMetric label="当前钱包余额" value={fmtMoney(managedMember?.wallet?.balance)} icon={<Wallet size={15} />} />
                  <ProfileMetric label="当前权益值余额" value={fmtMoney(managedMember?.equityAccount?.balance)} icon={<CircleDollarSign size={15} />} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="充值金额（元）" required hint="仅允许正整数，写入钱包流水">
                    <TextInput className="input" type="text" value={manageForm.amount} onChange={(event) => setManageForm({ ...manageForm, amount: event.target.value.replace(/\D/g, '') })} placeholder="请输入充值金额" />
                  </Field>
                  <Field label="充值原因" required hint="2–256 个字符，将写入财务审计">
                    <TextInput className="input" value={manageForm.rechargeReason} onChange={(event) => setManageForm({ ...manageForm, rechargeReason: event.target.value })} placeholder="例如：线下活动补偿" />
                  </Field>
                </div>
                <div className="flex justify-end"><Button variant="primary" disabled={manageBusy || !rechargeFormValid} onClick={() => void rechargeMemberWallet()}><Wallet size={14} />确认充值</Button></div>
              </div>
            )}
            {manageTab === 'danger' && canDeleteMembers && (
              <div className="space-y-4">
                <div className="notice notice-danger"><ShieldOff size={14} />注销后账号不能登录、下单或参与计酬。为保留财务与团队审计，系统会执行逻辑删除，不会物理删除资金和关系历史。</div>
                <Field label="注销原因" required hint="2–256 个字符，作为操作审计记录">
                  <TextInput className="input" value={manageForm.deleteReason} onChange={(event) => setManageForm({ ...manageForm, deleteReason: event.target.value })} placeholder="填写账号注销原因" />
                </Field>
                <div className="flex justify-end"><Button variant="danger" disabled={manageBusy || manageForm.deleteReason.trim().length < 2} onClick={() => void deleteMember()}><Trash2 size={14} />注销会员账号</Button></div>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title="调整会员等级"
        description={target ? `${target.nickname ?? '未设置昵称'} · ${target.phone ?? target.inviteCode}` : undefined}
        footer={(
          <>
            <Button onClick={() => setTarget(null)}>取消</Button>
            <Button variant="primary" onClick={() => void adjust()}>
              {role === 'SUPER_ADMIN' ? '立即调整等级' : '提交财务复核'}
            </Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          {ranks.filter((rank) => rank.status === 1).map(({ level: lv, name }) => (
            <button
              key={lv}
              type="button"
              onClick={() => setLevel(lv)}
              aria-pressed={level === lv}
              className={`rounded-lg border px-3 py-2.5 text-left transition ${
                level === lv
                  ? 'border-accent bg-accent-soft text-accent-ink ring-1 ring-accent'
                  : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:bg-hover'
              }`}
            >
              <div className="text-xs font-medium">{name}</div>
              <div className="mt-0.5 text-2xs text-ink-faint">Lv.{lv}</div>
            </button>
          ))}
        </div>
        <div className="notice notice-warning mt-4">
          <ShieldOff size={14} />
          手工调级需双人复核（运营申请 / 财务复核）。该操作将提交等级调整审批，最终结果以审批记录为准。
        </div>
      </Modal>

      <Drawer
        open={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        width={720}
        title={profile?.nickname ?? selectedMember?.nickname ?? '会员详情'}
        description={(
          <span className="mono">
            {profile?.phone ?? selectedMember?.phone ?? '—'} · ID {selectedMember?.id}
          </span>
        )}
      >
        {detailLoading ? (
          <LoadingBlock text="正在加载会员档案…" />
        ) : detailError ? (
          <div className="notice notice-danger">
            <ShieldOff size={14} />
            会员档案加载失败：{detailError}
          </div>
        ) : profile && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <ProfileMetric label="团队累计业绩" value={fmtMoney(profile.totalTeamPerformance)} icon={<TrendingUp size={15} />} />
              <ProfileMetric
                label="钱包可用余额"
                value={fmtMoney(Number(profile.wallet?.balance ?? 0) - Number(profile.wallet?.frozen ?? 0))}
                icon={<Wallet size={15} />}
              />
              <ProfileMetric label="权益值余额" value={fmtMoney(profile.equityAccount?.balance)} icon={<CircleDollarSign size={15} />} />
            </div>

            <Card>
              <CardHeader
                title="基础信息"
                icon={<UserRound size={14} />}
                action={canManageMembers && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setNewParentId(''); setParentSearch(''); setSelectedParent(null); setRebindReason(''); setRebindOpen(true); }}
                  >
                    <GitBranch size={13} />发起关系换绑
                  </Button>
                )}
              />
              <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2">
                <KeyValue label="邀请码" value={profile.inviteCode} mono />
                <KeyValue label="会员等级" value={profile.rank?.name ?? rankName(profile.rankLevel)} />
                <KeyValue label="当前档位" value={profile.package?.name ?? '普通用户'} />
                <KeyValue label="档位到期时间" value={profile.packageExpireAt ? fmtDate(profile.packageExpireAt) : '—'} />
                <KeyValue label="直接推荐人" value={profile.parent?.nickname ?? '无'} />
                <KeyValue label="关系层级" value={`第 ${profile.depth} 层`} />
                <KeyValue label="注册时间" value={fmtDate(profile.createdAt)} />
                <KeyValue label="账号状态" value={statusLabel(profile.status)} />
                <KeyValue label="计酬状态" value={profile.equityStatus === 0 ? '正常计酬' : '暂停计酬'} />
                <KeyValue label="实名状态" value={profile.realNameStatus === 1 ? '已认证' : '未认证'} />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader
                title="团队关系树"
                icon={<GitBranch size={14} />}
                action={(
                  <span className="text-2xs text-ink-faint">
                    直属 {teamTree?.children.length ?? 0} 人 · 团队 {teamTree ? countDescendants(teamTree) : 0} 人
                  </span>
                )}
              />
              {teamTree
                ? <div className="space-y-1 p-4"><TeamTreeNode node={teamTree} root rankLabels={Object.fromEntries(ranks.map((rank) => [rank.level, rank.name]))} /></div>
                : <Empty text="暂无团队关系数据" />}
            </Card>
          </div>
        )}
      </Drawer>

      <Modal
        open={rebindOpen && !!profile}
        onClose={() => setRebindOpen(false)}
        title="申请调整推荐关系"
        description={`会员：${profile?.nickname ?? profile?.phone ?? profile?.id ?? ''}`}
        size="lg"
        footer={(
          <>
            <Button onClick={() => setRebindOpen(false)}>取消</Button>
            <Button
              variant="primary"
              disabled={!rebindReason.trim() || rebindBusy}
              onClick={() => void submitRebind()}
            >
              {rebindBusy ? '处理中…' : role === 'SUPER_ADMIN' ? '确认调整关系' : '提交财务复核'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <Field label="新推荐人" hint="不选择新推荐人即解除当前关系">
            <div className="relative">
              <TextInput
                className="input"
                value={parentSearch}
                onChange={(event) => { setParentSearch(event.target.value); setSelectedParent(null); setNewParentId(''); }}
                placeholder="搜索会员昵称、手机号或邀请码"
              />
              {parentSearch.trim().length >= 2 && !selectedParent && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-pop">
                  {parentSearching ? (
                    <div className="px-3 py-2 text-xs text-ink-faint">正在搜索会员…</div>
                  ) : parentCandidates.length ? (
                    parentCandidates.map((candidate) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition hover:bg-hover"
                        onClick={() => {
                          setSelectedParent(candidate);
                          setNewParentId(candidate.id);
                          setParentSearch(`${candidate.nickname ?? '会员'} · ${candidate.phone ?? candidate.inviteCode}`);
                          setParentCandidates([]);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{candidate.nickname ?? '未设置昵称'}</span>
                          <span className="mt-0.5 block mono text-2xs text-ink-faint">{candidate.phone ?? candidate.inviteCode}</span>
                        </span>
                        <span className="shrink-0 text-2xs text-ink-faint">ID {candidate.id}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-2 text-xs text-ink-faint">未找到可用会员</div>
                  )}
                </div>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3 text-2xs text-ink-faint">
              <span>{selectedParent ? `已选择：${selectedParent.nickname ?? '会员'}（ID ${selectedParent.id}）` : '搜索并选择新的推荐人，或留空解除关系'}</span>
              {selectedParent && (
                <button
                  type="button"
                  className="text-accent-ink hover:underline"
                  onClick={() => { setSelectedParent(null); setNewParentId(''); setParentSearch(''); }}
                >
                  清除选择
                </button>
              )}
            </div>
          </Field>
          <div className="notice">
            <GitBranch size={14} />
            当前推荐人：{profile?.parent?.nickname ?? '无'}{profile?.parent ? `（ID ${profile.parent.id}）` : ''}。系统会阻止绑定到本人或其下级。
          </div>
          <Field label="调整原因" required>
            <TextInput
              className="input"
              value={rebindReason}
              onChange={(event) => setRebindReason(event.target.value)}
              placeholder="说明换绑原因，作为审批与审计依据"
            />
          </Field>
          <div className="notice notice-warning">
            <ShieldOff size={14} />
            该操作会同步更新整个下级团队的关系路径。运营申请需财务复核，超管操作会立即生效。
          </div>
        </div>
      </Modal>

      {confirmNode}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

function ProfileMetric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="subtle-panel p-3.5">
      <div className="flex items-center gap-1.5 text-2xs text-ink-muted">{icon}<span>{label}</span></div>
      <div className="num mt-2 text-lg font-semibold text-ink">{value}</div>
    </div>
  );
}
