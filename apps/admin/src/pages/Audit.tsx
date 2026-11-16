import { Button, Badge, Card, PageHeader } from '../components/ui';
import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api';

const ACTION_NAMES: Record<string, string> = {
  WALLET_ADJUST: '钱包调整', EQUITY_ADJUST: '权益值调整', BONUS_ADJUST: '奖金调整',
  PEER_LOCK: '平级奖锁定', REBIND: '关系换绑', RANK_MANUAL: '手工调级',
};

export function Audit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [action, setAction] = useState('');

  useEffect(() => {
    api<any>(`/admin/audit-logs${action ? `?action=${action}` : ''}`)
      .then((r) => setLogs(r.list ?? r as any)).catch(() => {});
  }, [action]);

  return (
    <>
      <PageHeader title="审计日志" description="资金操作与敏感变更全流程留痕，不可篡改" />

      <div className="mb-5 flex flex-wrap gap-2">
        {['', 'ADJUST', 'PEER_LOCK', 'REBIND'].map((v) => (
          <Button key={v} className={action === v ? 'btn-primary' : 'btn-ghost'} style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => setAction(v)}>
            {v === '' ? '全部' : v === 'ADJUST' ? '调整类' : v === 'PEER_LOCK' ? '平级锁定' : '关系换绑'}
          </Button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {logs.length === 0 ? <div className="py-16 text-center text-sm text-slate-600">暂无审计记录</div> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-white/[0.04]">
                <th className="th">ID</th><th className="th">操作</th><th className="th">操作人</th>
                <th className="th">目标</th><th className="th">变更内容</th><th className="th">时间</th>
              </tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-white/[0.03]">
                    <td className="td font-mono text-xs text-slate-600">#{l.id}</td>
                    <td className="td"><Badge tone="indigo">{ACTION_NAMES[l.action] ?? l.action}</Badge></td>
                    <td className="td text-xs">{l.operatorType}<div className="text-[10px] text-slate-600">ID {l.operatorId ?? '—'}</div></td>
                    <td className="td text-xs text-slate-500">{l.targetType} {l.targetId ?? ''}</td>
                    <td className="td font-mono text-[11px] text-slate-500">{JSON.stringify(l.after ?? l.before ?? {}).slice(0, 90)}</td>
                    <td className="td text-xs text-slate-500">{fmtDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
