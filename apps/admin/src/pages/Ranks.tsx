import { useEffect, useState } from 'react';
import { ArrowUpRight, Layers, Plus, Power, Save, Trash2, TrendingUp, Users } from 'lucide-react';
import { api, del, fmtDate, fmtMoney, getAdminRole, post, put } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, Field, Modal, PageHeader, StatCard, Tabs, TableSkeleton,
  TextInput, Toast, cx, useConfirm,
} from '../components/ui';

const percent = (value: unknown) => `${(Number(value) * 100).toFixed(1)}%`;

export function Ranks() {
  const [tab, setTab] = useState<'config' | 'logs'>('config');
  const [ranks, setRanks] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [toast, setToast] = useState('');
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const role = getAdminRole();
  const canManage = role === 'SUPER_ADMIN';
  const { confirm, confirmNode } = useConfirm();

  const notify = (message: string, nextTone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setTone(nextTone);
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api<any[]>('/admin/ranks').then((r) => setRanks(r as any)).catch((e) => notify(e.message, 'error')),
      api<any[]>('/admin/ranks/logs').then((r) => setLogs(r as any)).catch(() => {}),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: editing.name,
        threshold: Number(editing.threshold),
        teamRate: Number(editing.teamRate),
        poolRate: Number(editing.poolRate),
      };
      if (creating) await post('/admin/ranks', payload);
      else await put(`/admin/ranks/${editing.id}`, payload);
      notify(creating ? '新等级已创建' : '等级配置已保存，下次日结生效', 'success');
      setEditing(null);
      setCreating(false);
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    const nextThreshold = Math.max(0, ...ranks.map((rank) => Number(rank.threshold) || 0)) + 1;
    setCreating(true);
    setEditing({ name: '', threshold: String(nextThreshold), teamRate: '0', poolRate: '0' });
  };

  const toggleStatus = async (rank: any) => {
    const enable = rank.status !== 1;
    const agreed = await confirm({
      title: `${enable ? '启用' : '停用'} ${rank.name}？`,
      description: enable
        ? '启用后该等级可用于新的自动晋级与会员调级。'
        : '停用后不再自动晋级到该等级，现有会员保留该等级与历史分配规则。',
      confirmText: enable ? '确认启用' : '确认停用',
      tone: enable ? 'primary' : 'danger',
    });
    if (!agreed) return;
    try {
      await put(`/admin/ranks/${rank.id}/status`, { status: enable ? 1 : 0 });
      notify(`${rank.name}已${enable ? '启用' : '停用'}`, 'success');
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    }
  };

  const removeRank = async (rank: any) => {
    const agreed = await confirm({
      title: `删除 ${rank.name}？`,
      description: '仅无会员、分红快照与升级记录引用的等级可以删除。已有历史数据的等级请停用。',
      confirmText: '删除等级',
      tone: 'danger',
    });
    if (!agreed) return;
    try {
      await del(`/admin/ranks/${rank.id}`);
      notify('等级已删除', 'success');
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    }
  };

  const autoLogs = logs.filter((l) => l.triggerType === 'AUTO').length;

  return (
    <>
      <PageHeader
        title="等级管理"
        description="职级门槛与费率配置（修改后下次日结生效）、历史升级记录"
        action={canManage ? <Button variant="primary" onClick={openCreate}><Plus size={15} />新增等级</Button> : undefined}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="等级层级" value={String(ranks.length)} icon={<Layers size={17} />} accent="brand" trend={`启用 ${ranks.filter((rank) => rank.status === 1).length} 个等级`} />
        <StatCard
          label="最高业绩门槛"
          value={fmtMoney(Math.max(0, ...ranks.map((r) => Number(r.threshold) || 0)))}
          icon={<TrendingUp size={17} />}
          accent="success"
          trend="累计业绩达到门槛自动升级"
        />
        <StatCard label="升级记录" value={String(logs.length)} icon={<ArrowUpRight size={17} />} accent="info" trend="含自动升级与手工调整" />
        <StatCard label="自动升级占比" value={logs.length ? `${Math.round((autoLogs / logs.length) * 100)}%` : '—'} icon={<Users size={17} />} accent="warning" trend={`自动 ${autoLogs} 条 / 手工 ${logs.length - autoLogs} 条`} />
      </div>

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(value) => setTab(value as 'config' | 'logs')}
        items={[
          { value: 'config', label: '等级配置', count: ranks.length },
          { value: 'logs', label: '升级记录', count: logs.length },
        ]}
      />

      {tab === 'config' ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="等级参数"
            description="团队奖费率与分红池比例均以小数填写，例如 0.05 表示 5%"
          />
          {loading ? <TableSkeleton rows={7} cols={6} /> : ranks.length === 0 ? (
            <Empty text="暂无等级配置" description="等级体系由后端初始化，如缺失请检查基础数据。" icon={<Layers size={18} />} />
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="th">等级</th>
                    <th className="th">名称</th>
                    <th className="th text-right">累计业绩门槛</th>
                    <th className="th text-right">团队奖费率</th>
                    <th className="th text-right">分红池比例</th>
                    <th className="th">状态</th>
                    <th className="th text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {ranks.map((r) => (
                    <tr key={r.id} className="admin-row">
                      <td className="td"><Badge tone={r.level > 0 ? 'brand' : 'neutral'}>Lv.{r.level}</Badge></td>
                      <td className="td"><span className="cell-strong">{r.name}</span></td>
                      <td className="td num text-right">{fmtMoney(r.threshold)}</td>
                      <td className="td num text-right text-accent-ink">{percent(r.teamRate)}</td>
                      <td className="td num text-right text-success">{percent(r.poolRate)}</td>
                      <td className="td"><Badge tone={r.status === 1 ? 'success' : 'neutral'} dot>{r.status === 1 ? '已启用' : '已停用'}</Badge></td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-1">
                          {canManage && <Button size="xs" variant="ghost" onClick={() => { setCreating(false); setEditing({ ...r }); }}>编辑</Button>}
                          {canManage && <Button size="xs" variant="ghost" disabled={r.level === 0} onClick={() => void toggleStatus(r)}><Power size={13} />{r.status === 1 ? '停用' : '启用'}</Button>}
                          {canManage && <Button size="xs" variant="ghost" className="hover:text-danger" disabled={r.level === 0} onClick={() => void removeRank(r)}><Trash2 size={13} />删除</Button>}
                          {!canManage && <span className="text-xs text-ink-faint">只读</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader title="升级记录" description="自动升级由日结任务触发，手工调整为运营操作" />
          {loading ? <TableSkeleton rows={8} cols={5} /> : logs.length === 0 ? (
            <Empty text="暂无升级记录" description="会员达到业绩门槛后，升级记录会显示在这里。" icon={<ArrowUpRight size={18} />} />
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="th">会员</th>
                    <th className="th">等级变化</th>
                    <th className="th text-right">触发时累计业绩</th>
                    <th className="th">类型</th>
                    <th className="th">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="admin-row">
                      <td className="td"><span className="cell-strong">{l.user?.nickname ?? '—'}</span></td>
                      <td className="td">
                        <div className="flex items-center gap-1.5">
                          <Badge tone="neutral">Lv.{l.fromLevel}</Badge>
                          <span className="text-ink-faint">→</span>
                          <Badge tone="brand">Lv.{l.toLevel}</Badge>
                        </div>
                      </td>
                      <td className="td num text-right">{fmtMoney(l.totalPerformance)}</td>
                      <td className="td">
                        <Badge tone={l.triggerType === 'AUTO' ? 'success' : 'warning'}>
                          {l.triggerType === 'AUTO' ? '自动' : '手工'}
                        </Badge>
                      </td>
                      <td className="td text-xs text-ink-muted">{fmtDate(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && (
        <Modal
          onClose={() => setEditing(null)}
          title={creating ? '新增会员等级' : `编辑等级 · ${editing.name}`}
          description={creating ? '新等级将追加到当前最高层级，等级编号自动生成。' : '保存后将在下次日结任务生效，不会追溯历史数据'}
          footer={(
            <>
              <Button onClick={() => { setEditing(null); setCreating(false); }}>取消</Button>
              <Button variant="primary" disabled={saving || !editing.name.trim()} onClick={save}>
                <Save size={14} /> {saving ? '保存中…' : creating ? '创建等级' : '保存'}
              </Button>
            </>
          )}
        >
          <div className="space-y-4">
            <Field label="等级名称" required>
              <TextInput value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="累计业绩门槛（元）" hint="达到该累计业绩后自动升级到此等级">
              <input
                className="input"
                type="number"
                value={editing.threshold}
                onChange={(e) => setEditing({ ...editing, threshold: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="团队奖费率（0-1）">
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={editing.teamRate}
                  onChange={(e) => setEditing({ ...editing, teamRate: e.target.value })}
                />
              </Field>
              <Field label="分红池比例（0-1）">
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={editing.poolRate}
                  onChange={(e) => setEditing({ ...editing, poolRate: e.target.value })}
                />
              </Field>
            </div>
            <div className={cx('notice', 'notice-info')}>
              费率填写小数：0.05 = 5%。修改影响后续日结的奖金池分配，请与财务确认后再保存。
            </div>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} tone={tone} onClose={() => setToast('')} />}
      {confirmNode}
    </>
  );
}
