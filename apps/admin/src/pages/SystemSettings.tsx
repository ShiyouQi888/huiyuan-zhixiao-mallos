import { useEffect, useState } from 'react';
import { Save, Settings2, ShieldCheck } from 'lucide-react';
import { api, put } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, Field, Modal, PageHeader, TableSkeleton, Tabs, Toast,
} from '../components/ui';

const PERMISSION_ROWS = [
  { label: '查看会员与订单', access: ['可查看', '可查看', '可查看', '可查看'] },
  { label: '会员等级调整', access: ['可直接处理', '提交申请', '财务复核', '无权限'] },
  { label: '奖金手工调整', access: ['可直接处理', '提交申请', '财务复核', '无权限'] },
  { label: '日结重跑', access: ['可直接处理', '提交申请', '财务复核', '无权限'] },
  { label: '转账风控审核', access: ['可审核', '可审核', '无权限', '无权限'] },
  { label: '功能开关配置', access: ['可配置', '无权限', '无权限', '无权限'] },
  { label: '等级规则配置', access: ['可配置', '无权限', '无权限', '无权限'] },
  { label: '经营报表', access: ['可查看', '可查看', '可查看', '仅业绩'] },
  { label: '系统配置与审计', access: ['可管理', '无权限', '无权限', '无权限'] },
];

const ROLE_TONES = ['brand', 'info', 'success', 'neutral'] as const;

export function SystemSettings() {
  const [tab, setTab] = useState<'configs' | 'roles'>('configs');
  const [configs, setConfigs] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');

  const notify = (message: string, nextTone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setTone(nextTone);
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      api<any[]>('/admin/configs').then(setConfigs).catch((e) => notify(e.message, 'error')),
      api<any[]>('/admin/roles').then(setRoles).catch(() => {}),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      notify('配置值不是有效 JSON。字符串请使用双引号，例如 "value"', 'error');
      return;
    }
    setSaving(true);
    try {
      await put(`/admin/configs/${encodeURIComponent(editing.key)}`, { value: parsed });
      notify('配置已保存并立即生效', 'success');
      setEditing(null);
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="系统设置" description="全局业务参数与角色权限矩阵" />

      <Tabs
        className="mb-4"
        value={tab}
        onChange={(value) => setTab(value as 'configs' | 'roles')}
        items={[
          { value: 'configs', label: '系统配置', count: configs.length },
          { value: 'roles', label: '角色权限' },
        ]}
      />

      {tab === 'configs' ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="全局配置项"
            description="值为 JSON 格式，保存后立即生效，请谨慎修改"
            icon={<Settings2 size={15} />}
          />
          {loading ? <TableSkeleton rows={8} cols={5} /> : configs.length === 0 ? (
            <Empty text="暂无配置项" description="后端初始化后会注册全局业务参数。" icon={<Settings2 size={18} />} />
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="th">配置键</th>
                    <th className="th">分组</th>
                    <th className="th">当前值</th>
                    <th className="th">说明</th>
                    <th className="th text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map((c) => (
                    <tr key={c.id} className="admin-row">
                      <td className="td mono text-xs text-accent-ink">{c.key}</td>
                      <td className="td"><Badge tone="neutral">{c.group}</Badge></td>
                      <td className="td">
                        <span className="mono block max-w-[280px] truncate text-xs text-ink" title={JSON.stringify(c.value)}>
                          {JSON.stringify(c.value)}
                        </span>
                      </td>
                      <td className="td text-xs text-ink-muted">{c.description ?? '—'}</td>
                      <td className="td text-right">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => { setEditing(c); setValue(JSON.stringify(c.value, null, 2)); }}
                        >
                          编辑
                        </Button>
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
          <CardHeader
            title={(
              <span className="flex items-center gap-2"><ShieldCheck size={15} /> 角色权限矩阵</span>
            )}
            description="敏感操作遵循运营申请、财务复核；超管具备应急直通权限。"
          />
          <div className="table-wrap">
            <table className="admin-table min-w-[760px]">
              <thead>
                <tr>
                  <th className="th">功能范围</th>
                  <th className="th">超级管理员</th>
                  <th className="th">运营</th>
                  <th className="th">财务</th>
                  <th className="th">客服</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSION_ROWS.map((row) => (
                  <tr key={row.label} className="admin-row">
                    <td className="td"><span className="cell-strong">{row.label}</span></td>
                    {row.access.map((access, index) => (
                      <td key={index} className="td">
                        <Badge tone={access === '无权限' ? 'neutral' : ROLE_TONES[index]}>
                          {access}
                        </Badge>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-4 py-2.5 text-2xs leading-5 text-ink-faint">
            角色说明：{roles.length
              ? roles.map((role) => `${role.name}：${role.desc}`).join(' · ')
              : '超级管理员、运营、财务、客服四类角色，权限由后端鉴权中间件强制执行。'}
          </div>
        </Card>
      )}

      {editing && (
        <Modal
          onClose={() => setEditing(null)}
          title="编辑配置"
          description={editing.description}
          size="lg"
          footer={(
            <>
              <Button onClick={() => setEditing(null)}>取消</Button>
              <Button variant="primary" disabled={saving} onClick={() => void save()}>
                <Save size={14} /> {saving ? '保存中…' : '保存配置'}
              </Button>
            </>
          )}
        >
          <div className="space-y-4">
            <div className="subtle-panel px-3 py-2">
              <div className="text-2xs text-ink-faint">配置键</div>
              <div className="mono mt-0.5 text-xs text-accent-ink">{editing.key}</div>
            </div>
            <Field label="配置值（JSON）" hint={'字符串需使用双引号，例如 "value"；数字与布尔值直接填写'}>
              <textarea
                className="textarea mono min-h-40 text-xs"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                spellCheck={false}
              />
            </Field>
            <div className="notice notice-warning">修改全局配置会立即影响线上业务，请确认影响范围后再保存。</div>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} tone={tone} onClose={() => setToast('')} />}
    </>
  );
}
