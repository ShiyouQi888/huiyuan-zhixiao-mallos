import { useEffect, useRef, useState } from 'react';
import { Button, TextInput, Badge, Card, PageHeader, Toast } from '../components/ui';
import { Check, FileText, Image as ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import { api, resolveAssetUrl, del } from '../api';
import { ImageCropDialog, PRODUCT_IMAGE_PRESETS, ProductImagePreset } from './ImageCropDialog';

export interface FileItem {
  id: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  createdAt: string;
}

const CATEGORIES = [
  { value: 'ALL', label: '全部' },
  { value: 'PRODUCT', label: '商品图片' },
  { value: 'CATEGORY', label: '分类图标' },
  { value: 'AVATAR', label: '头像' },
  { value: 'OTHER', label: '其他' },
];

type CropQueue = { files: File[]; index: number; preset: ProductImagePreset };

export function FileManager({ picker = false, onPick, currentUrls = [], cropPreset }: {
  picker?: boolean;
  onPick?: (urls: string[]) => void;
  currentUrls?: string[];
  cropPreset?: ProductImagePreset;
}) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [category, setCategory] = useState('ALL');
  const [keyword, setKeyword] = useState('');
  const [uploadCategory, setUploadCategory] = useState('PRODUCT');
  const [uploadPreset, setUploadPreset] = useState<ProductImagePreset>(cropPreset ?? 'product-cover');
  const [selected, setSelected] = useState<string[]>(currentUrls);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [cropQueue, setCropQueue] = useState<CropQueue | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const q = new URLSearchParams({ category, page: '1' });
    if (keyword) q.set('keyword', keyword);
    try {
      const result = await api<{ list: FileItem[] }>(`/admin/files?${q}`);
      setFiles(result.list ?? []);
    } catch (error: any) {
      setToast(error.message ?? '文件列表加载失败');
    }
  };
  useEffect(() => { void load(); }, [category, keyword]);

  const sendFile = async (file: File, targetCategory: string): Promise<FileItem> => {
    const form = new FormData();
    form.append('file', file);
    form.append('category', targetCategory);
    const token = localStorage.getItem('solar_admin_token');
    const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api';
    const response = await fetch(`${base}/admin/files/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const envelope = await response.json();
    if (!response.ok || envelope.code !== 0) throw new Error(envelope.message ?? '上传失败');
    return envelope.data as FileItem;
  };

  const uploadOriginalFiles = async (fileList: File[], targetCategory: string) => {
    if (!fileList.length) return;
    setUploading(true);
    const uploaded: FileItem[] = [];
    try {
      for (const file of fileList) uploaded.push(await sendFile(file, targetCategory));
      await load();
      if (picker) setSelected((current) => [...new Set([...current, ...uploaded.filter((file) => file.mimeType.startsWith('image/')).map((file) => file.url)])]);
      setToast(`成功上传并入库 ${uploaded.length} 个文件`);
    } catch (error: any) {
      setToast(error.message ?? '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const chosen = Array.from(fileList);
    if (!chosen.length) return;
    const preset = picker ? (cropPreset ?? 'product-cover') : uploadPreset;
    const imageFiles = chosen.filter((file) => file.type.startsWith('image/'));
    const otherFiles = chosen.filter((file) => !file.type.startsWith('image/'));

    if (picker && otherFiles.length) {
      setToast('商品素材选择器仅支持图片文件');
    } else if (!picker && uploadCategory !== 'PRODUCT') {
      await uploadOriginalFiles(chosen, uploadCategory);
    } else {
      if (otherFiles.length) await uploadOriginalFiles(otherFiles, 'OTHER');
      if (imageFiles.length) setCropQueue({ files: imageFiles, index: 0, preset });
      else if (!otherFiles.length) setToast('请选择有效的图片文件');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const advanceCropQueue = () => {
    setCropQueue((queue) => {
      if (!queue || queue.index + 1 >= queue.files.length) return null;
      return { ...queue, index: queue.index + 1 };
    });
  };

  const uploadCroppedFile = async (croppedFile: File) => {
    if (!cropQueue) return;
    setUploading(true);
    try {
      const uploaded = await sendFile(croppedFile, 'PRODUCT');
      await load();
      if (picker) setSelected((current) => current.includes(uploaded.url) ? current : [...current, uploaded.url]);
      setToast(`已裁剪并入库：${uploaded.originalName}`);
      advanceCropQueue();
    } catch (error: any) {
      setToast(error.message ?? '图片入库失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string, url: string) => {
    try {
      await del(`/admin/files/${id}`);
      setToast('文件已删除');
      setSelected((current) => current.filter((item) => item !== url));
      await load();
    } catch (error: any) { setToast(error.message ?? '删除失败'); }
  };

  const toggle = (url: string) => {
    setSelected((current) => current.includes(url) ? current.filter((item) => item !== url) : [...current, url]);
  };

  const confirmPick = () => {
    onPick?.(selected);
    setSelected([]);
  };

  const activePreset = picker ? (cropPreset ?? 'product-cover') : uploadPreset;
  const activePresetInfo = PRODUCT_IMAGE_PRESETS[activePreset];
  const currentCropFile = cropQueue?.files[cropQueue.index];
  const visibleFiles = picker ? files.filter((file) => file.mimeType.startsWith('image/')) : files;

  return (
    <>
      {!picker && (
        <PageHeader title="文件管理" description="统一管理商城图片素材；主图按 H5 展示比例裁剪，详情长图按内容自适应入库" />
      )}

      <div className={`grid gap-5 ${picker ? 'xl:grid-cols-[280px_minmax(0,1fr)]' : 'lg:grid-cols-4'}`}>
        <Card className={`p-5 ${picker ? 'xl:col-span-1' : 'lg:col-span-1'}`}>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-white"><UploadCloud size={16} className="text-indigo-300" />上传素材</div>
          <p className="mb-4 text-xs leading-5 text-slate-500">商品图片经预设裁剪后自动生成文件并写入素材库。</p>
          {!picker && <>
            <label htmlFor="file-category" className="mb-2 block text-xs text-slate-400">文件分类</label>
            <select id="file-category" className="input mb-4" value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>
              {CATEGORIES.filter((item) => item.value !== 'ALL').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </>}

          {(!picker && uploadCategory === 'PRODUCT') && <>
            <label htmlFor="image-preset" className="mb-2 block text-xs text-slate-400">商城用途与输出尺寸</label>
            <select id="image-preset" className="input mb-2" value={uploadPreset} onChange={(event) => setUploadPreset(event.target.value as ProductImagePreset)}>
              {Object.entries(PRODUCT_IMAGE_PRESETS).map(([value, preset]) => <option key={value} value={value}>{preset.label}</option>)}
            </select>
            <p className="mb-4 min-h-10 text-[11px] leading-5 text-slate-500">{activePresetInfo.description}</p>
          </>}
          {picker && <div className="mb-4 rounded-lg border border-indigo-400/20 bg-indigo-400/[0.06] p-3">
            <div className="text-xs font-medium text-indigo-200">{activePresetInfo.label}</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-400">{activePresetInfo.description}</p>
          </div>}

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFiles(event.dataTransfer.files); }}
            disabled={uploading || !!cropQueue}
            className={`flex min-h-36 w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 py-7 text-center transition disabled:cursor-wait disabled:opacity-60 ${dragging ? 'border-indigo-400 bg-indigo-400/10' : 'border-white/15 bg-surface-900 hover:border-indigo-400/50 hover:bg-indigo-400/[0.04]'}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-400/10 text-indigo-300"><UploadCloud size={20} /></span>
            <span className="mt-3 text-xs font-medium text-slate-200">{uploading ? '正在上传并入库…' : '拖放文件到此处，或点击浏览'}</span>
            <span className="mt-1 text-[10px] text-slate-500">图片、PDF、ZIP · 单个文件不超过 10 MB</span>
          </button>
          <input ref={fileRef} type="file" multiple accept={picker ? 'image/*' : 'image/*,.pdf,.zip'} className="hidden" onChange={(event) => void handleFiles(event.target.files ?? [])} />
          <div className="mt-4 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[11px] leading-5 text-slate-500">
            <ImageIcon size={14} className="mt-0.5 shrink-0 text-slate-500" />
            <span>{picker ? '裁剪完成后会自动选中，可继续多选现有素材再确认。' : '主图适配 H5 正方形展示；详情图保留长图比例。非商品素材保持原文件入库。'}</span>
          </div>
        </Card>

        <Card className={picker ? 'xl:col-span-1' : 'lg:col-span-3'}>
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] p-4">
            {CATEGORIES.map((item) => (
              <Button key={item.value} onClick={() => setCategory(item.value)}
                className={`rounded-lg px-3 py-1.5 text-xs transition ${category === item.value ? 'bg-accent/15 text-indigo-300' : 'text-slate-500 hover:text-slate-200'}`}>
                {item.label}
              </Button>
            ))}
            <TextInput className="input ml-auto w-40" placeholder="搜索文件名" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            {picker && <Button className="btn-primary" style={{ padding: '7px 14px', fontSize: 12 }} onClick={confirmPick}>
              <Check size={14} />确认选择{selected.length ? ` (${selected.length})` : ''}
            </Button>}
          </div>

          {visibleFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-600">
              <ImageIcon size={32} className="mb-3 opacity-40" />
              <div className="text-sm">暂无文件{picker ? '，可直接在左侧上传裁剪' : ''}</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
              {visibleFiles.map((file) => {
                const isSelected = selected.includes(file.url);
                const isImage = file.mimeType.startsWith('image/');
                return (
                  <div key={file.id}
                    role={picker ? 'checkbox' : undefined}
                    aria-checked={picker ? isSelected : undefined}
                    tabIndex={picker ? 0 : undefined}
                    onKeyDown={picker ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(file.url); } } : undefined}
                    className={`group relative overflow-hidden rounded-xl border transition ${isSelected ? 'border-accent ring-1 ring-accent/30' : 'border-white/[0.06] hover:border-white/20'} ${picker ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400' : ''}`}
                    onClick={() => picker && toggle(file.url)}>
                    <div className="flex h-32 items-center justify-center bg-surface-900">
                      {isImage ? <img src={resolveAssetUrl(file.url)} alt={file.originalName} className="h-full w-full object-contain" loading="lazy" /> : <FileText size={28} className="text-slate-500" aria-label="文件" />}
                    </div>
                    <div className="p-2.5">
                      <div className="truncate text-[11px] text-slate-300" title={file.originalName}>{file.originalName}</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500">{(file.size / 1024).toFixed(0)} KB</span>
                        <Badge tone="slate">{CATEGORIES.find((item) => item.value === file.category)?.label ?? file.category}</Badge>
                      </div>
                    </div>
                    {isSelected && <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white"><Check size={14} /></div>}
                    {!picker && <Button onClick={(event) => { event.stopPropagation(); void remove(file.id, file.url); }} className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-rose-400 opacity-0 transition group-hover:opacity-100 focus:opacity-100" aria-label={`删除文件 ${file.originalName}`}><Trash2 size={14} /></Button>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {currentCropFile && cropQueue && <ImageCropDialog
        key={`${currentCropFile.name}-${cropQueue.index}`}
        file={currentCropFile}
        preset={cropQueue.preset}
        progress={`正在处理第 ${cropQueue.index + 1} / ${cropQueue.files.length} 张图片`}
        busy={uploading}
        onCancel={advanceCropQueue}
        onConfirm={uploadCroppedFile}
      />}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
