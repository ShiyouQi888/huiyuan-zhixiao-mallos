import { Button, TextInput, Badge, Card, PageHeader, Toast } from '../components/ui';
import { useEffect, useState } from 'react';
import { Folder, House, Laptop, Leaf, Pencil, Plus, Smartphone, Trash2, Utensils, type LucideIcon } from 'lucide-react';
import { api, del, post, put } from '../api';

const categoryIcons = [
  { name: 'Folder', label: '通用', Icon: Folder },
  { name: 'House', label: '家居', Icon: House },
  { name: 'Laptop', label: '数码', Icon: Laptop },
  { name: 'Leaf', label: '健康', Icon: Leaf },
  { name: 'Utensils', label: '厨房', Icon: Utensils },
  { name: 'Smartphone', label: '配件', Icon: Smartphone },
] as const;

const categoryIconMap: Record<string, LucideIcon> = Object.fromEntries(categoryIcons.map((item) => [item.name, item.Icon]));
const getCategoryIcon = (name: string | null | undefined) => categoryIconMap[name ?? ''] ?? Folder;
const isCategoryIcon = (name: string | null | undefined) => categoryIcons.some((item) => item.name === name);

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  icon: string | null;
  sort: number;
  status: number;
  children?: Category[];
}

export function Categories() {
  const [flat, setFlat] = useState<Category[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [toast, setToast] = useState('');

  const load = () => {
    api<Category[]>('/admin/catalog/categories?all=true').then(setFlat).catch((e) => setToast(e.message));
  };
  useEffect(load, []);

  const roots = flat.filter((c) => !c.parentId);
  const childrenOf = (id: string) => flat.filter((c) => c.parentId === id);

  const save = async () => {
    try {
      if (editing.id) {
        await put(`/admin/catalog/categories/${editing.id}`, {
          name: editing.name,
          parentId: editing.parentId || null,
          icon: isCategoryIcon(editing.icon) ? editing.icon : 'Folder',
          sort: Number(editing.sort),
          status: Number(editing.status),
        });
      } else {
        await post('/admin/catalog/categories', {
          name: editing.name,
          parentId: editing.parentId || null,
          icon: isCategoryIcon(editing.icon) ? editing.icon : 'Folder',
          sort: Number(editing.sort),
        });
      }
      setToast(editing.id ? '分类已保存' : '分类已创建');
      setEditing(null); load();
    } catch (e: any) { setToast(e.message); }
  };

  const remove = async (c: Category) => {
    try {
      await del(`/admin/catalog/categories/${c.id}`);
      setToast('分类已删除'); load();
    } catch (e: any) { setToast(e.message); }
  };

  const renderRow = (c: Category, depth = 0) => {
    const CategoryIcon = getCategoryIcon(c.icon);
    return (
      <div key={c.id}>
      <div className="flex items-center border-b border-white/[0.03] px-4 py-3.5 transition hover:bg-white/[0.02]" style={{ paddingLeft: 16 + depth * 32 }}>
        <div className="flex w-8 items-center justify-center text-slate-500"><CategoryIcon size={18} strokeWidth={1.8} /></div>
        <div className="ml-2 flex-1">
          <div className="text-sm text-slate-200">{c.name}</div>
          <div className="mt-0.5 text-[10px] text-slate-600">ID {c.id} · 排序 {c.sort}</div>
        </div>
        <Badge tone={c.status === 1 ? 'green' : 'slate'}>{c.status === 1 ? '启用' : '停用'}</Badge>
        <div className="ml-4 flex gap-2">
          <Button className="text-xs text-indigo-400 hover:text-indigo-300" onClick={() => setEditing({ ...c })}><Pencil size={14} className="inline" /> 编辑</Button>
          <Button className="text-xs text-slate-500 hover:text-rose-400" onClick={() => remove(c)}><Trash2 size={14} className="inline" /> 删除</Button>
        </div>
      </div>
      {childrenOf(c.id).map((child) => renderRow(child, depth + 1))}
      </div>
    );
  };

  return (
    <>
      <PageHeader title="商品分类" description="支持两级分类，商品可归入任意分类，会员端按分类浏览"
        action={<Button className="btn-primary" onClick={() => setEditing({ name: '', parentId: '', icon: 'Folder', sort: 0, status: 1 })}><Plus size={16} /> 新增分类</Button>} />

      <Card className="overflow-hidden">
        <div className="border-b border-white/[0.06] px-4 py-3 text-xs text-slate-500">共 {flat.length} 个分类（一级 {roots.length} 个）</div>
        {roots.length === 0 ? <div className="py-16 text-center text-sm text-slate-600">暂无分类</div> : roots.map((r) => renderRow(r))}
      </Card>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setEditing(null)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-5 text-base font-semibold text-white">{editing.id ? '编辑分类' : '新增分类'}</h3>
            <div className="space-y-4">
              <div><label className="mb-1.5 block text-xs text-slate-400">分类名称</label>
                <TextInput className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label className="mb-1.5 block text-xs text-slate-400">上级分类（留空为一级）</label>
                <select className="input" value={editing.parentId ?? ''} onChange={(e) => setEditing({ ...editing, parentId: e.target.value })}>
                  <option value="">— 一级分类 —</option>
                  {roots.filter((r) => r.id !== editing.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
              <div>
                <label className="mb-2 block text-xs text-slate-400">分类图标</label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {categoryIcons.map(({ name, label, Icon }) => (
                    <Button key={name} theme={getCategoryIcon(editing.icon) === Icon ? 'primary' : 'default'} variant={getCategoryIcon(editing.icon) === Icon ? 'base' : 'outline'}
                      aria-label={`选择${label}图标`} aria-pressed={getCategoryIcon(editing.icon) === Icon}
                      className={`flex h-16 flex-col items-center justify-center gap-1 rounded-xl border ${getCategoryIcon(editing.icon) === Icon ? 'border-accent bg-accent/10 text-indigo-400' : 'border-white/10 text-slate-400'}`}
                      onClick={() => setEditing({ ...editing, icon: name })}>
                      <Icon size={18} /><span className="text-[10px]">{label}</span>
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1.5 block text-xs text-slate-400">排序</label>
                  <input className="input" type="number" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: e.target.value })} /></div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button className="btn-ghost" onClick={() => setEditing(null)}>取消</Button>
              <Button className="btn-primary" onClick={save}>保存</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
