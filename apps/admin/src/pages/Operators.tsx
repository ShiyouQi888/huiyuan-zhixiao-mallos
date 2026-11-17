import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { KeyRound, LockKeyhole, RefreshCw, ShieldCheck, UserCog, UserPlus, Users, UserRoundCheck } from 'lucide-react';
import {
  ADMIN_PERMISSION_MODULES,
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_PERMISSION_CODES,
  type AdminRole,
} from '@solar/shared';
import { api, fmtDate, post, put } from '../api';
import {
  Badge, Button, Card, CardHeader, Field, Modal, PageHeader, SearchField, SelectField, TableSkeleton, Toast, useConfirm,
} from '../components/ui';

interface OperatorAccount {
  id: string;
  nickname: string | null;
  phone: string | null;
  role: AdminRole;
  status: number;
  adminPermissionsCustomized: boolean;
  adminPermissionCodes: string[];
  createdAt: string;
  updatedAt: string;
}

interface AccountForm {
  nickname: string;
  phone: string;
  password: string;
  role: AdminRole;
  customPermissions: boolean;
  permissionCodes: string[];
}

const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN: '系统最高权限，可管理所有业务页面及运营账号。',
  OPERATOR: '负责日常商品、会员、订单与运营流程。',
  FINANCE: '负责财务、结算、奖金与相关报表。',
  SUPPORT: '仅查看会员、订单与经营报表。',
};

const ROLE_OPTIONS = Object.entries(ADMIN_ROLE_LABELS).map(([value, label]) => ({ value, label }));
const emptyForm = (): AccountForm => ({
  nickname: '', phone: '', password: '', role: 'OPERATOR', customPermissions: false,
  permissionCodes: [...ADMIN_ROLE_PERMISSION_CODES.OPERATOR],
});

function currentAdminId(): string {
  try {
    const payload = localStorage.getItem('solar_admin_token')?.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!payload) return '';
    const decoded = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return String(decoded.sub ?? '');
  } catch {
    return '';
  }
}

export function Operators() {
  const [accounts, setAccounts] = useState<OperatorAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editing, setEditing] = useState<OperatorAccount | null | false>(false);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const [toastTone, setToastTone] = useState<'success' | 'error' | 'info'>('info');
  const { confirm, confirmNode } = useConfirm();
  const selfId = currentAdminId();

  const load = async () => {
    setLoading(true);
    setLoadError('');
    const params = new URLSearchParams();
    if (keyword.trim()) params.set('keyword', keyword.trim());
    if (statusFilter) params.set('status', statusFilter);
    try {
      const rows = await api<OperatorAccount[]>(`/admin/operators${params.size ? `?${params}` : ''}`);
      setAccounts(rows);
    } catch (error: any) {
      setLoadError(error.message ?? '运营账号加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [keyword, statusFilter]);

  const activeCount = useMemo(() => accounts.filter((account) => account.status === 0).length, [accounts]);
  const frozenCount = accounts.length - activeCount;
  const customCount = accounts.filter((account) => account.adminPermissionsCustomized).length;

  const notify = (message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setToastTone(tone);
  };

  const startCreate = () => {
    setForm(emptyForm());
    setEditing(null);
  };

  const startEdit = (account: OperatorAccount) => {
    setForm({
      nickname: account.nickname ?? '',
      phone: account.phone ?? '',
      password: '',
      role: account.role,
      customPermissions: account.adminPermissionsCustomized && account.role !== 'SUPER_ADMIN',
      permissionCodes: account.adminPermissionsCustomized
        ? [...account.adminPermissionCodes]
        : [...ADMIN_ROLE_PERMISSION_CODES[account.role]],
    });
    setEditing(account);
  };

  const updateRole = (role: AdminRole) => {
    setForm((previous) => ({
      ...previous,
      role,
      customPermissions: role === 'SUPER_ADMIN' ? false : previous.customPermissions,
      permissionCodes: [...ADMIN_ROLE_PERMISSION_CODES[role]],
    }));
  };

  const togglePermission = (code: string) => {
    setForm((previous) => ({
      ...previous,
      permissionCodes: previous.permissionCodes.includes(code)
        ? previous.permissionCodes.filter((item) => item !== code)
        : [...previous.permissionCodes, code],
    }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const action = editing === null ? '创建' : '更新';
    const permissionCount = form.customPermissions && form.role !== 'SUPER_ADMIN'
      ? form.permissionCodes.length
      : ADMIN_ROLE_PERMISSION_CODES[form.role].length;
    const agreed = await confirm({
      title: `确认${action}运营管理账号？`,
      description: `${form.nickname.trim()} · ${form.phone} · ${ADMIN_ROLE_LABELS[form.role]} · ${permissionCount} 项页面权限。账号权限变更会立即生效。`,
      confirmText: `确认${action}账号`,
      tone: form.role === 'SUPER_ADMIN' ? 'danger' : 'primary',
      confirmationText: `${action}运营账号 ${form.nickname.trim()} ${form.phone}`,
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const body = {
        nickname: form.nickname.trim(),
        ...(editing === null ? { phone: form.phone.trim(), password: form.password } : {}),
        ...(editing && form.password ? { password: form.password } : {}),
        role: form.role,
        permissionCodes: form.customPermissions && form.role !== 'SUPER_ADMIN' ? form.permissionCodes : null,
      };
      if (editing === null) await post('/admin/operators', body);
      else if (editing) await put(`/admin/operators/${editing.id}`, body);
      notify(editing === null ? '运营账号已创建' : '账号角色与权限已更新', 'success');
      setEditing(false);
      await load();
    } catch (error: any) {
      notify(error.message ?? '保存失败，请检查表单后重试', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (account: OperatorAccount) => {
    if (account.id === selfId) return;
    const nextStatus = account.status === 0 ? 1 : 0;
    const action = nextStatus === 1 ? '停用' : '启用';
    const agreed = await confirm({
      title: `确认${action}运营账号？`,
      description: `${account.nickname ?? '未设置昵称'}（${account.phone ?? account.id}）。${nextStatus === 1 ? '停用后后续管理请求会被拒绝。' : '启用后该账号将恢复现有角色权限。'}`,
      confirmText: `确认${action}账号`,
      tone: nextStatus === 1 ? 'danger' : 'primary',
      confirmationText: `${action}运营账号 ${account.nickname ?? account.phone ?? account.id}`,
    });
    if (!agreed) return;
    setBusyId(account.id);
    try {
      await put(`/admin/operators/${account.id}/status`, { status: nextStatus });
      notify(nextStatus === 1 ? '账号已停用，后续请求将被拒绝' : '账号已重新启用', 'success');
      await load();
    } catch (error: any) {
      notify(error.message ?? '账号状态更新失败', 'error');
    } finally {
      setBusyId('');
    }
  };

  const selectableModules = ADMIN_PERMISSION_MODULES.filter((module) => ADMIN_ROLE_PERMISSION_CODES[form.role].includes(module.code));
  const isSelfEdit = Boolean(editing && editing.id === selfId);
  const formOpen = editing !== false;
  const canSave = form.nickname.trim().length >= 2
    && form.phone.trim().length === 11
    && (Boolean(editing) || form.password.length >= 8)
    && (!form.password || form.password.length >= 8)
    && (!form.customPermissions || form.role === 'SUPER_ADMIN' || form.permissionCodes.length > 0);

  return (
    <>
      <PageHeader
        title="运营账号"
        description="创建后台登录账号，分配管理员角色与页面级权限。"
        action={<Button variant="primary" onClick={startCreate}><UserPlus size={14} />新增运营账号</Button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AccountMetric label="账号总数" value={String(accounts.length)} icon={<Users size={17} />} tone="brand" />
        <AccountMetric label="正常使用" value={String(activeCount)} icon={<UserRoundCheck size={17} />} tone="success" />
        <AccountMetric label="自定义权限" value={String(customCount)} icon={<KeyRound size={17} />} tone="info" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="后台账号与权限"
          description="角色决定权限上限；自定义页面权限只会缩小角色范围。冻结账号会立即失去后续接口访问权。"
          icon={<ShieldCheck size={15} />}
          action={<Badge tone={frozenCount ? 'warning' : 'neutral'}>{frozenCount} 个已停用</Badge>}
        />

        <div className="filter-bar flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          <SearchField value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索姓名或手机号" ariaLabel="搜索运营账号" />
          <SelectField
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            ariaLabel="按账号状态筛选"
            className="w-[130px]"
            options={[{ value: '', label: '全部状态' }, { value: '0', label: '正常' }, { value: '1', label: '已停用' }]}
          />
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />刷新</Button>
        </div>

        {loading ? <TableSkeleton rows={5} cols={6} /> : loadError ? (
          <div className="p-8 text-center">
            <div className="notice notice-danger mx-auto mb-3 max-w-xl">{loadError}</div>
            <Button variant="outline" onClick={() => void load()}>重新加载</Button>
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-raised text-ink-3"><UserCog size={19} /></div>
            <div className="text-sm font-medium text-ink">暂无运营账号</div>
            <p className="mt-1 text-xs text-ink-muted">新增账号后，可为工作人员分配对应角色与业务页面权限。</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="admin-table min-w-[850px]">
              <thead><tr>
                <th className="th">账号</th><th className="th">系统角色</th><th className="th">页面权限</th>
                <th className="th">账号状态</th><th className="th">创建时间</th><th className="th text-right">操作</th>
              </tr></thead>
              <tbody>
                {accounts.map((account) => {
                  const permissionCount = account.role === 'SUPER_ADMIN'
                    ? ADMIN_PERMISSION_MODULES.length
                    : account.adminPermissionsCustomized
                      ? account.adminPermissionCodes.length
                      : ADMIN_ROLE_PERMISSION_CODES[account.role].length;
                  return (
                    <tr key={account.id} className="admin-row">
                      <td className="td">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-3"><UserCog size={15} /></span>
                          <span className="min-w-0">
                            <strong className="block truncate text-xs font-semibold text-ink">{account.nickname || '未设置名称'}{account.id === selfId && <span className="ml-1.5 text-2xs font-normal text-ink-faint">当前账号</span>}</strong>
                            <span className="mono mt-0.5 block text-2xs text-ink-faint">{account.phone}</span>
                          </span>
                        </div>
                      </td>
                      <td className="td"><Badge tone={account.role === 'SUPER_ADMIN' ? 'brand' : account.role === 'FINANCE' ? 'success' : account.role === 'OPERATOR' ? 'info' : 'neutral'}>{ADMIN_ROLE_LABELS[account.role]}</Badge></td>
                      <td className="td">
                        <span className="text-xs text-ink-2">{account.role === 'SUPER_ADMIN' ? '全部页面' : `${permissionCount} 个页面`}</span>
                        <span className="ml-1.5 text-2xs text-ink-faint">{account.role === 'SUPER_ADMIN' ? '最高权限' : account.adminPermissionsCustomized ? '自定义' : '角色默认'}</span>
                      </td>
                      <td className="td"><Badge tone={account.status === 0 ? 'success' : 'warning'}>{account.status === 0 ? '正常' : '已停用'}</Badge></td>
                      <td className="td text-xs text-ink-muted">{fmtDate(account.createdAt)}</td>
                      <td className="td">
                        <div className="flex justify-end gap-1.5">
                          <Button size="xs" variant="ghost" onClick={() => startEdit(account)}>角色与权限</Button>
                          <Button size="xs" variant={account.status === 0 ? 'danger-soft' : 'outline'} disabled={account.id === selfId || busyId === account.id}
                            onClick={() => void toggleStatus(account)}>
                            {busyId === account.id ? '处理中…' : account.status === 0 ? '停用' : '启用'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {formOpen && (
        <Modal
          onClose={() => setEditing(false)}
          title={editing === null ? '新增运营账号' : '编辑运营账号'}
          description={editing === null ? '创建可登录管理后台的独立账号，并指定其工作范围。' : '修改账号名称、角色、页面权限或重置登录密码。'}
          size="lg"
          footer={(
            <>
              <Button onClick={() => setEditing(false)}>取消</Button>
              <Button type="submit" form="operator-account-form" variant="primary" disabled={!canSave || saving}>
                {saving ? '保存中…' : editing === null ? '创建账号' : '保存分配'}
              </Button>
            </>
          )}
        >
          <form id="operator-account-form" className="space-y-4" onSubmit={(event) => void save(event)}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="账号名称" required>
                <input className="input" value={form.nickname} maxLength={64} placeholder="例如：华东运营" onChange={(event) => setForm((previous) => ({ ...previous, nickname: event.target.value }))} />
              </Field>
              <Field label="管理员手机号" required>
                <input className="input" type="tel" inputMode="numeric" maxLength={11} disabled={editing !== null}
                  value={form.phone} placeholder="11 位大陆手机号" onChange={(event) => setForm((previous) => ({ ...previous, phone: event.target.value.replace(/\D/g, '').slice(0, 11) }))} />
              </Field>
              <Field label={editing === null ? '初始登录密码' : '重置登录密码'} required={editing === null}
                hint={editing === null ? '至少 8 位，创建后可由管理员重置' : '留空表示保持当前密码不变'}>
                <input className="input" type="password" autoComplete="new-password" maxLength={64} value={form.password}
                  placeholder={editing === null ? '设置至少 8 位密码' : '留空不修改'} onChange={(event) => setForm((previous) => ({ ...previous, password: event.target.value }))} />
              </Field>
              <Field label="系统角色" required>
                <select className="admin-select" value={form.role} disabled={isSelfEdit}
                  onChange={(event) => updateRole(event.target.value as AdminRole)}>
                  {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
            </div>

            <div className="subtle-panel p-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><ShieldCheck size={16} /></span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-ink">{ADMIN_ROLE_LABELS[form.role]}</div>
                  <p className="mt-1 text-2xs leading-5 text-ink-muted">{ROLE_DESCRIPTIONS[form.role]}</p>
                </div>
              </div>
            </div>

            {form.role === 'SUPER_ADMIN' ? (
              <div className="notice notice-warning"><LockKeyhole size={15} />超级管理员始终拥有全部管理权限，系统会阻止停用或降级最后一名正常的超级管理员。</div>
            ) : (
              <section className="permission-assignment">
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-ink">页面权限分配</div>
                    <p className="mt-0.5 text-2xs text-ink-faint">最多只能分配当前角色允许访问的页面。</p>
                  </div>
                  <div className="segmented" role="tablist" aria-label="权限分配方式">
                    <button type="button" role="tab" aria-selected={!form.customPermissions} className={`segmented-item ${!form.customPermissions ? 'active' : ''}`}
                      onClick={() => setForm((previous) => ({ ...previous, customPermissions: false }))}>角色默认</button>
                    <button type="button" role="tab" aria-selected={form.customPermissions} className={`segmented-item ${form.customPermissions ? 'active' : ''}`}
                      onClick={() => setForm((previous) => ({ ...previous, customPermissions: true }))}>自定义</button>
                  </div>
                </div>
                <div className={`permission-module-grid ${!form.customPermissions ? 'is-inherited' : ''}`}>
                  {selectableModules.map((module) => {
                    const checked = form.permissionCodes.includes(module.code);
                    return (
                      <label key={module.code} className="permission-module-row">
                        <input type="checkbox" checked={checked} disabled={!form.customPermissions || isSelfEdit}
                          onChange={() => togglePermission(module.code)} />
                        <span className="min-w-0"><strong>{module.name}</strong><small>{module.description}</small></span>
                      </label>
                    );
                  })}
                </div>
                {!form.customPermissions && <div className="mt-2 text-2xs text-ink-faint">当前将使用 {selectableModules.length} 项角色默认权限。</div>}
                {form.customPermissions && form.permissionCodes.length === 0 && <div className="mt-2 text-2xs text-danger">至少选择一个页面权限。</div>}
                {isSelfEdit && <div className="mt-2 text-2xs text-ink-faint">不能修改当前登录超级管理员的角色与权限。</div>}
              </section>
            )}
          </form>
        </Modal>
      )}

      {toast && <Toast message={toast} tone={toastTone} onClose={() => setToast('')} />}
      {confirmNode}
    </>
  );
}

function AccountMetric({ label, value, icon, tone }: { label: string; value: string; icon: ReactNode; tone: 'brand' | 'success' | 'info' }) {
  const toneClass = tone === 'success' ? 'bg-success-soft text-success' : tone === 'info' ? 'bg-info-soft text-info' : 'bg-accent-soft text-accent-ink';
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div><div className="text-xs text-ink-muted">{label}</div><div className="num mt-1 text-xl font-semibold text-ink">{value}</div></div>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${toneClass}`}>{icon}</span>
      </div>
    </Card>
  );
}
