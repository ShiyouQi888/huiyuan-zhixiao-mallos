import { useEffect, useState } from 'react';
import { ArrowUpRight, Layers, Save, TrendingUp, Users } from 'lucide-react';
import { api, fmtDate, fmtMoney, put } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, Field, Modal, PageHeader, StatCard, Tabs, TableSkeleton,
  TextInput, Toast, cx,
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
      await put(`/admin/ranks/${editing.id}`, {
        name: editing.name,
        threshold: Number(editing.threshold),
        teamRate: Number(editing.teamRate),
        poolRate: Number(editing.poolRate),
      });
      notify('等级配置已保存，下次日结生效', 'success');
      setEditing(null);
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const autoLogs = logs.filter((l) => l.triggerType === 'AUTO').length;

  return (
    <>
      <PageHeader
        title="等级管理"
        description="职级门槛与费率配置（修改后下次日结生效）、历史升级记录"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="等级层级" value={String(ranks.length)} icon={<Layers size={17} />} accent="brand" trend="Lv.0 起共 7 级职级体系" />
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
                      <td className="td text-right">
                        <Button size="xs" variant="ghost" onClick={() => setEditing({ ...r })}>编辑</Button>
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
          title={`编辑等级 · ${editing.name}`}
          description="保存后将在下次日结任务生效，不会追溯历史数据"
          footer={(
            <>
              <Button onClick={() => setEditing(null)}>取消</Button>
              <Button variant="primary" disabled={saving} onClick={save}>
                <Save size={14} /> {saving ? '保存中…' : '保存'}
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
    </>
  );
}
