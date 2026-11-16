import { useEffect, useState } from 'react';
import { Eye, EyeOff, Image as ImageIcon, Link2, Package, Plus, Trash2, X } from 'lucide-react';
import { api, fmtMoney, patch, post, put, del, resolveAssetUrl } from '../api';
import {
  Badge, Button, Card, Checkbox, Drawer, Empty, Field, FilterBar, PageHeader, SearchField, SelectField,
  SectionLabel, TextInput, Toast, useConfirm,
} from '../components/ui';
import { FileManager } from './FileManager';

interface Product {
  id: string;
  name: string;
  subtitle: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  images: string[];
  details: string[];
  price: number;
  originalPrice: number;
  stock: number;
  sales: number;
  status: number;
  isNew: boolean;
  isFeatured: boolean;
  sort: number;
  packageBinds: Array<{ id: string; packageId: number; exclusivePrice: number | null; package: { name: string } }>;
}

export function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [picker, setPicker] = useState<'images' | 'details' | null>(null);
  const [toast, setToast] = useState('');
  const [toastTone, setToastTone] = useState<'success' | 'error' | 'info'>('info');
  const { confirm, confirmNode } = useConfirm();

  const notify = (message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setToastTone(tone);
  };

  const load = () => {
    const q = new URLSearchParams();
    if (keyword) q.set('keyword', keyword);
    if (categoryId) q.set('categoryId', categoryId);
    if (status !== '') q.set('status', status);
    api<{ list: Product[] }>(`/admin/catalog/products?${q}`).then((r) => setProducts(r.list ?? [])).catch((e) => notify(e.message, 'error'));
  };
  useEffect(load, [keyword, categoryId, status]);
  useEffect(() => {
    api<any[]>('/admin/catalog/categories?all=true').then(setCategories).catch(() => {});
    api<any[]>('/admin/packages').then(setPackages).catch(() => {});
  }, []);

  const openNew = () => setEditing({
    name: '', subtitle: '', description: '', categoryId: '', images: [], details: [],
    price: 0, originalPrice: 0, stock: 0, status: 0, isNew: false, isFeatured: false, sort: 0,
    packageIds: [], exclusivePrices: {},
  });

  const openEdit = async (p: Product) => {
    const detail = await api<Product>(`/admin/catalog/products/${p.id}`);
    setEditing({
      ...detail,
      categoryId: detail.categoryId ?? '',
      packageIds: detail.packageBinds.map((b) => b.packageId),
      exclusivePrices: Object.fromEntries(
        detail.packageBinds.filter((b) => b.exclusivePrice !== null).map((b) => [b.packageId, b.exclusivePrice]),
      ),
    });
  };

  const save = async () => {
    try {
      const payload = {
        name: editing.name,
        subtitle: editing.subtitle,
        description: editing.description,
        categoryId: editing.categoryId || null,
        images: editing.images,
        details: editing.details,
        price: Number(editing.price),
        originalPrice: Number(editing.originalPrice),
        stock: Number(editing.stock),
        status: Number(editing.status),
        isNew: !!editing.isNew,
        isFeatured: !!editing.isFeatured,
        sort: Number(editing.sort),
        packageIds: editing.packageIds,
        exclusivePrices: editing.exclusivePrices,
      };
      if (editing.id) {
        await put(`/admin/catalog/products/${editing.id}`, payload);
        notify('商品已保存', 'success');
      } else {
        await post('/admin/catalog/products', payload);
        notify('商品已创建', 'success');
      }
      setEditing(null); load();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const toggleStatus = async (p: Product) => {
    try {
      await patch('/admin/catalog/products/status', { ids: [p.id], status: p.status === 1 ? 0 : 1 });
      notify(p.status === 1 ? '已下架' : '已上架', 'success');
      load();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const remove = async (p: Product) => {
    const agreed = await confirm({
      title: `删除商品「${p.name}」？`,
      description: '删除后商品将从商城移除，此操作不可撤销。',
      confirmText: '删除商品',
      tone: 'danger',
    });
    if (!agreed) return;
    try {
      await del(`/admin/catalog/products/${p.id}`);
      notify('商品已删除', 'success'); load();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const togglePackage = (id: number) => {
    const ids: number[] = editing.packageIds ?? [];
    setEditing({ ...editing, packageIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });
  };

  return (
    <>
      <PageHeader
        title="商品管理"
        description="完整上架管理：分类、图片素材（来自文件管理）、会员档位专属价与可见范围"
        action={<Button variant="primary" onClick={openNew}><Plus size={15} /> 新增商品</Button>}
      />

      <Card className="overflow-hidden">
        <FilterBar>
          <SearchField
            className="w-full sm:w-[260px]"
            placeholder="搜索商品名称"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <SelectField
            ariaLabel="商品分类筛选"
            className="w-[148px]"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={[
              { value: '', label: '全部分类' },
              ...categories.filter((c) => !c.parentId).map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
          <SelectField
            ariaLabel="商品状态筛选"
            className="w-[124px]"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: '全部状态' },
              { value: '1', label: '已上架' },
              { value: '0', label: '已下架' },
            ]}
          />
          {(keyword || categoryId || status !== '') && (
            <Button size="sm" variant="ghost" onClick={() => { setKeyword(''); setCategoryId(''); setStatus(''); }}>重置筛选</Button>
          )}
          <div className="ml-auto text-xs text-ink-faint">
            共 <span className="num text-ink-soft">{products.length}</span> 件商品
          </div>
        </FilterBar>

        {products.length === 0 ? (
          <Empty
            text="暂无商品"
            description="新增商品后即可在商城展示，并可绑定会员档位专属价。"
            icon={<Package size={18} />}
            action={<Button size="sm" variant="primary" onClick={openNew}><Plus size={13} />新增商品</Button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="th">商品</th>
                  <th className="th">分类</th>
                  <th className="th text-right">价格</th>
                  <th className="th text-right">库存 / 销量</th>
                  <th className="th">可见档位</th>
                  <th className="th">状态</th>
                  <th className="th text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="admin-row">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        {p.images?.[0] ? (
                          <img src={resolveAssetUrl(p.images[0])} className="h-9 w-9 shrink-0 rounded-md border border-line object-cover" alt="" />
                        ) : (
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-raised text-ink-faint">
                            <ImageIcon size={16} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="cell-strong truncate">{p.name}</span>
                            {p.isFeatured && <Badge tone="warning">推荐</Badge>}
                            {p.isNew && <Badge tone="brand">新品</Badge>}
                          </div>
                          <div className="cell-muted mt-0.5 truncate">{p.subtitle ?? '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="td text-xs text-ink-muted">{p.category?.name ?? '未分类'}</td>
                    <td className="td text-right">
                      <span className="num font-medium text-ink">{fmtMoney(p.price)}</span>
                      {p.originalPrice > 0 && (
                        <div className="num text-2xs text-ink-faint line-through">{fmtMoney(p.originalPrice)}</div>
                      )}
                    </td>
                    <td className="td num text-right text-xs text-ink-muted">
                      {p.stock} / {p.sales}
                    </td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {p.packageBinds.length === 0
                          ? <Badge tone="neutral">全档可见</Badge>
                          : p.packageBinds.map((b) => (
                            <Badge key={b.id} tone="brand">
                              {b.package?.name}{b.exclusivePrice !== null ? ` ¥${b.exclusivePrice}` : ''}
                            </Badge>
                          ))}
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={p.status === 1 ? 'success' : 'neutral'} dot>
                        {p.status === 1 ? '已上架' : '已下架'}
                      </Badge>
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          size="xs"
                          variant="ghost"
                          iconOnly
                          title={p.status === 1 ? '下架' : '上架'}
                          aria-label={p.status === 1 ? '下架' : '上架'}
                          onClick={() => toggleStatus(p)}
                        >
                          {p.status === 1 ? <EyeOff size={14} /> : <Eye size={14} />}
                        </Button>
                        <Button size="xs" variant="ghost" className="text-accent-ink" onClick={() => void openEdit(p)}>编辑</Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          iconOnly
                          className="hover:text-danger"
                          aria-label={`删除 ${p.name}`}
                          onClick={() => void remove(p)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer
        open={!!editing && !picker}
        onClose={() => setEditing(null)}
        width={760}
        title={editing?.id ? '编辑商品' : '新增商品'}
        description="图片来自文件管理，可绑定多个会员档并设置专属价"
        footer={editing ? (
          <>
            <Button onClick={() => setEditing(null)}>取消</Button>
            <Button variant="primary" onClick={() => void save()}>保存商品</Button>
          </>
        ) : undefined}
      >
        {editing && (
          <div className="space-y-6">
            <section>
              <SectionLabel>基本信息</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="商品名称" required className="sm:col-span-2">
                  <TextInput className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </Field>
                <Field label="副标题" className="sm:col-span-2">
                  <TextInput className="input" value={editing.subtitle ?? ''} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
                </Field>
                <Field label="分类">
                  <select className="admin-select" value={editing.categoryId} onChange={(e) => setEditing({ ...editing, categoryId: e.target.value })}>
                    <option value="">未分类</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '　└ ' : ''}{c.name}</option>)}
                  </select>
                </Field>
                <Field label="排序" hint="数值越小越靠前">
                  <input className="input" type="number" value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: e.target.value })} />
                </Field>
                <Field label="商品描述" className="sm:col-span-2">
                  <textarea className="textarea" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </Field>
              </div>
            </section>

            <section>
              <SectionLabel>价格与库存</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="售价（元）" required>
                  <input className="input" type="number" value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} />
                </Field>
                <Field label="划线价">
                  <input className="input" type="number" value={editing.originalPrice} onChange={(e) => setEditing({ ...editing, originalPrice: e.target.value })} />
                </Field>
                <Field label="库存">
                  <input className="input" type="number" value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: e.target.value })} />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Checkbox checked={!!editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.checked ? 1 : 0 })}>立即上架</Checkbox>
                <Checkbox checked={!!editing.isNew} onChange={(e) => setEditing({ ...editing, isNew: e.target.checked })}>标记为新品</Checkbox>
                <Checkbox checked={!!editing.isFeatured} onChange={(e) => setEditing({ ...editing, isFeatured: e.target.checked })}>首页推荐</Checkbox>
              </div>
            </section>

            <section>
              <SectionLabel action={(
                <Button size="xs" variant="ghost" className="text-accent-ink" onClick={() => setPicker('images')}>
                  <ImageIcon size={13} /> 从文件管理选取
                </Button>
              )}>
                图片素材
              </SectionLabel>
              <div className="flex flex-wrap gap-2">
                {(editing.images ?? []).map((url: string, i: number) => (
                  <div key={i} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-line">
                    <img src={resolveAssetUrl(url)} className="h-full w-full object-cover" alt="" />
                    <button
                      type="button"
                      aria-label="移除图片"
                      onClick={() => setEditing({ ...editing, images: editing.images.filter((_: string, idx: number) => idx !== i) })}
                      className="absolute right-1 top-1 hidden rounded bg-black/70 p-1 text-white group-hover:block"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPicker('images')}
                  className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-line-strong text-ink-faint transition hover:border-accent hover:text-accent"
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-ink-soft">详情图</span>
                <Button size="xs" variant="ghost" className="text-accent-ink" onClick={() => setPicker('details')}>
                  <ImageIcon size={13} /> 从文件管理选取
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(editing.details ?? []).map((url: string, i: number) => (
                  <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-line">
                    <img src={resolveAssetUrl(url)} className="h-full w-full object-cover" alt="" />
                    <button
                      type="button"
                      aria-label="移除详情图"
                      onClick={() => setEditing({ ...editing, details: editing.details.filter((_: string, idx: number) => idx !== i) })}
                      className="absolute right-0.5 top-0.5 hidden rounded bg-black/70 p-0.5 text-white group-hover:block"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionLabel action={<Link2 size={13} className="text-ink-faint" />}>会员档绑定</SectionLabel>
              <p className="mb-3 text-2xs text-ink-faint">勾选后该档位会员可见；不勾选任何档位则全档可见。可设置档位专属价。</p>
              <div className="space-y-2">
                {packages.map((p) => {
                  const bound = (editing.packageIds ?? []).includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition ${
                        bound ? 'border-accent/40 bg-accent-soft' : 'border-line bg-panel'
                      }`}
                    >
                      <Checkbox checked={bound} onChange={() => togglePackage(p.id)} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-ink">{p.name}</div>
                        <div className="text-2xs text-ink-faint">Lv.{p.level} · 标准价 {fmtMoney(p.price)}</div>
                      </div>
                      {bound && (
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-2xs text-ink-faint">专属价</span>
                          <input
                            className="input h-8 w-28"
                            type="number"
                            placeholder="留空用标准价"
                            value={editing.exclusivePrices?.[p.id] ?? ''}
                            onChange={(e) => setEditing({ ...editing, exclusivePrices: { ...editing.exclusivePrices, [p.id]: e.target.value } })}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </Drawer>

      {picker && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-canvas p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink">选择{picker === 'images' ? '商品主图' : '详情图'}</h3>
              <p className="mt-1 text-xs text-ink-muted">从文件管理中选择，可多选</p>
            </div>
            <Button variant="secondary" onClick={() => setPicker(null)}>返回编辑</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-panel">
            <FileManager
              picker
              cropPreset={picker === 'images' ? 'product-cover' : 'product-detail'}
              currentUrls={editing?.[picker] ?? []}
              onPick={(urls) => {
                setEditing({ ...editing, [picker]: urls });
                setPicker(null);
              }}
            />
          </div>
        </div>
      )}

      {confirmNode}
      {toast && <Toast message={toast} tone={toastTone} onClose={() => setToast('')} />}
    </>
  );
}
