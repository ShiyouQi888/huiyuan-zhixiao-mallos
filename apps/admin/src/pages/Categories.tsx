import { useEffect, useState } from 'react';
import {
  Folder, House, Laptop, Leaf, Pencil, Plus, Smartphone, Trash2, Utensils, type LucideIcon,
} from 'lucide-react';
import { api, del, post, put } from '../api';
import {
  Badge, Button, Card, Empty, Field, Modal, PageHeader, TextInput, Toast, cx, useConfirm,
} from '../components/ui';

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
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');
  const [saving, setSaving] = useState(false);
  const { confirm, confirmNode } = useConfirm();

  const notify = (message: string, nextTone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setTone(nextTone);
  };

  const load = () => {
    api<Category[]>('/admin/catalog/categories?all=true').then(setFlat).catch((e) => notify(e.message, 'error'));
  };
  useEffect(load, []);

  const roots = flat.filter((c) => !c.parentId);
  const childrenOf = (id: string) => flat.filter((c) => c.parentId === id);

  const save = async () => {
    if (!editing.name?.trim()) {
      notify('请填写分类名称', 'error');
      return;
    }
    const previous = editing.id ? flat.find((item) => item.id === editing.id) : null;
    if (previous?.status === 1 && Number(editing.status) === 0) {
      const agreed = await confirm({
        title: `确认停用分类「${editing.name}」？`,
        description: '停用后该分类不会出现在会员端商城导航中。',
        confirmText: '确认停用分类',
        tone: 'danger',
        confirmationText: `停用分类 ${editing.name}`,
      });
      if (!agreed) return;
    }
    setSaving(true);
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
      notify(editing.id ? '分类已保存' : '分类已创建', 'success');
      setEditing(null);
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Category) => {
    const agreed = await confirm({
      title: `删除分类「${c.name}」？`,
      description: childrenOf(c.id).length > 0
        ? '该分类下还有子分类，删除后子分类将失去归属，请先调整子分类。'
        : '删除后该分类将从商城导航移除，此操作不可撤销。',
      confirmText: '删除分类',
      tone: 'danger',
      confirmationText: `删除 ${c.name}`,
    });
    if (!agreed) return;
    try {
      await del(`/admin/catalog/categories/${c.id}`);
      notify('分类已删除', 'success');
      load();
    } catch (e: any) {
      notify(e.message, 'error');
    }
  };

  const renderRow = (c: Category, depth = 0) => {
    const CategoryIcon = getCategoryIcon(c.icon);
    const childCount = childrenOf(c.id).length;
    return (
      <div key={c.id}>
        <div
          className="admin-row group flex items-center gap-3 border-b border-line px-4 py-2.5 transition-colors hover:bg-hover"
          style={{ paddingLeft: 16 + depth * 28 }}
        >
          <span className={cx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            depth === 0 ? 'bg-accent-soft text-accent-ink' : 'bg-raised text-ink-3',
          )}>
            <CategoryIcon size={15} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={cx('truncate', depth === 0 ? 'cell-strong' : 'text-[13px] text-ink')}>{c.name}</span>
              {childCount > 0 && <span className="text-2xs text-ink-faint">{childCount} 个子分类</span>}
            </div>
            <div className="cell-muted mt-0.5 truncate">ID {c.id} · 排序 {c.sort}</div>
          </div>
          <Badge tone={c.status === 1 ? 'success' : 'neutral'}>{c.status === 1 ? '启用' : '停用'}</Badge>
          <div className="flex shrink-0 items-center gap-1">
            <Button size="xs" variant="ghost" onClick={() => setEditing({ ...c })}>
              <Pencil size={13} /> 编辑
            </Button>
            <Button size="xs" variant="ghost" className="text-ink-3 hover:text-danger" onClick={() => remove(c)}>
              <Trash2 size={13} /> 删除
            </Button>
          </div>
        </div>
        {childrenOf(c.id).map((child) => renderRow(child, depth + 1))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="商品分类"
        description="支持两级分类，商品可归入任意分类，会员端按分类浏览"
        action={(
          <Button
            variant="primary"
            onClick={() => setEditing({ name: '', parentId: '', icon: 'Folder', sort: 0, status: 1 })}
          >
            <Plus size={15} /> 新增分类
          </Button>
        )}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="text-xs text-ink-muted">
            共 <span className="num text-ink">{flat.length}</span> 个分类
            <span className="mx-1.5 text-ink-faint">·</span>
            一级 <span className="num text-ink">{roots.length}</span> 个
          </div>
          <div className="text-2xs text-ink-faint">分类顺序由「排序」升序决定</div>
        </div>
        {roots.length === 0 ? (
          <Empty
            text="暂无分类"
            description="创建一级分类后，商品即可按分类归档并在会员端浏览。"
            icon={<Folder size={18} />}
            action={(
              <Button
                size="sm"
                variant="primary"
                onClick={() => setEditing({ name: '', parentId: '', icon: 'Folder', sort: 0, status: 1 })}
              >
                <Plus size={13} /> 新增分类
              </Button>
            )}
          />
        ) : roots.map((r) => renderRow(r))}
      </Card>

      {editing && (
        <Modal
          onClose={() => setEditing(null)}
          title={editing.id ? '编辑分类' : '新增分类'}
          description={editing.id ? '修改后立即在会员端生效' : '留空上级分类即创建为一级分类'}
          footer={(
            <>
              <Button onClick={() => setEditing(null)}>取消</Button>
              <Button variant="primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存'}</Button>
            </>
          )}
        >
          <div className="space-y-4">
            <Field label="分类名称" required>
              <TextInput
                value={editing.name}
                placeholder="例如：智能家居"
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="上级分类" hint="仅支持两级，二级分类不可再挂子分类">
              <select
                className="admin-select"
                value={editing.parentId ?? ''}
                aria-label="上级分类"
                onChange={(e) => setEditing({ ...editing, parentId: e.target.value })}
              >
                <option value="">— 一级分类 —</option>
                {roots.filter((r) => r.id !== editing.id).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>
            <Field label="分类图标">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {categoryIcons.map(({ name, label, Icon }) => {
                  const active = getCategoryIcon(editing.icon) === Icon && isCategoryIcon(editing.icon);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-label={`选择${label}图标`}
                      aria-pressed={active}
                      onClick={() => setEditing({ ...editing, icon: name })}
                      className={cx(
                        'flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-2xs transition',
                        active
                          ? 'border-accent bg-accent-soft text-accent-ink'
                          : 'border-line text-ink-3 hover:border-line-strong hover:bg-hover hover:text-ink',
                      )}
                    >
                      <Icon size={17} strokeWidth={1.8} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="排序" hint="数值越小越靠前">
                <TextInput
                  type="text"
                  value={String(editing.sort ?? 0)}
                  onChange={(e) => setEditing({ ...editing, sort: e.target.value })}
                />
              </Field>
              {editing.id && (
                <Field label="状态">
                  <select
                    className="admin-select"
                    value={String(editing.status)}
                    aria-label="分类状态"
                    onChange={(e) => setEditing({ ...editing, status: Number(e.target.value) })}
                  >
                    <option value="1">启用</option>
                    <option value="0">停用</option>
                  </select>
                </Field>
              )}
            </div>
          </div>
        </Modal>
      )}

      {confirmNode}
      {toast && <Toast message={toast} tone={tone} onClose={() => setToast('')} />}
    </>
  );
}
