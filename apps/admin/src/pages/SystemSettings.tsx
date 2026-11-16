import { Button, Badge, Card, PageHeader, Toast } from '../components/ui';
import { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { api, put } from '../api';

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

export function SystemSettings() {
  const [tab, setTab] = useState<'configs' | 'roles'>('configs');
  const [configs, setConfigs] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = () => {
    api<any[]>('/admin/configs').then(setConfigs).catch((e) => setToast(e.message));
    api<any[]>('/admin/roles').then(setRoles).catch(() => {});
  };
  useEffect(load, []);

  const save = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setToast('配置值不是有效 JSON。字符串请使用双引号，例如 "value"');
      return;
    }
    setSaving(true);
    try {
      await put(`/admin/configs/${encodeURIComponent(editing.key)}`, { value: parsed });
      setToast('配置已保存并立即生效');
      setEditing(null); load();
    } catch (e: any) { setToast(e.message); }
    finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader title="系统设置" description="全局业务参数与角色权限矩阵" />

      <div className="mb-5 flex gap-2">
        <Button className={tab === 'configs' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('configs')}>系统配置</Button>
        <Button className={tab === 'roles' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('roles')}>角色权限</Button>
      </div>

      {tab === 'configs' ? (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-white/[0.04]">
              <th className="th">配置键</th><th className="th">分组</th><th className="th">当前值</th><th className="th">说明</th><th className="th text-right">操作</th>
            </tr></thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                  <td className="td font-mono text-xs text-indigo-300">{c.key}</td>
                  <td className="td"><Badge tone="slate">{c.group}</Badge></td>
                  <td className="td text-slate-200">{JSON.stringify(c.value)}</td>
                  <td className="td text-xs text-slate-500">{c.description ?? '—'}</td>
                  <td className="td text-right">
                    <Button className="text-xs text-indigo-400 hover:text-indigo-300" onClick={() => { setEditing(c); setValue(JSON.stringify(c.value)); }}>编辑</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><ShieldCheck size={16} className="text-indigo-400" />角色权限矩阵</div>
            <p className="mt-1 text-xs text-slate-500">敏感操作遵循运营申请、财务复核；超管具备应急直通权限。</p>
          </div>
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[760px]">
              <thead><tr><th className="th">功能范围</th><th className="th">超级管理员</th><th className="th">运营</th><th className="th">财务</th><th className="th">客服</th></tr></thead>
              <tbody>
                {PERMISSION_ROWS.map((row) => (
                  <tr key={row.label} className="admin-row border-t border-white/[0.04]">
                    <td className="td font-medium text-slate-800 dark:text-slate-200">{row.label}</td>
                    {row.access.map((value, index) => {
                      const enabled = value !== '无权限';
                      return <td key={index} className="td"><span className={`inline-flex items-center rounded-md px-2 py-1 text-xs ${enabled ? 'bg-indigo-500/[0.09] text-indigo-500' : 'bg-surface-800 text-slate-500'}`}>{value}</span></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/[0.06] px-5 py-3 text-xs text-slate-500">角色说明：{roles.map((role) => `${role.name}：${role.desc}`).join(' · ')}</div>
        </Card>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setEditing(null)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold text-white">编辑配置</h3>
            <p className="mb-5 font-mono text-xs text-indigo-300">{editing.key}</p>
            <div className="mb-4"><label className="mb-1.5 block text-xs text-slate-400">配置值（JSON）</label>
              <textarea className="input min-h-32 resize-y font-mono text-xs" value={value} onChange={(e) => setValue(e.target.value)} spellCheck={false} /></div>
            <div className="mb-5 text-[11px] text-slate-600">{editing.description}</div>
            <div className="flex justify-end gap-3">
              <Button className="btn-ghost" onClick={() => setEditing(null)}>取消</Button>
              <Button className="btn-primary" disabled={saving} onClick={() => void save()}><Save size={15} />{saving ? '保存中…' : '保存'}</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
