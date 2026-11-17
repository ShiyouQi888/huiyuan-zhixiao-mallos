import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Eye, FileArchive, FileText, Image as ImageIcon, Pencil, Trash2, UploadCloud } from 'lucide-react';
import { api, resolveAssetUrl, del, patch } from '../api';
import {
  Badge, Button, Card, CardHeader, Empty, Field, Modal, PageHeader, Pagination, SearchField, Toast, cx, useConfirm,
} from '../components/ui';
import { ImageCropDialog, PRODUCT_IMAGE_PRESETS, ProductImagePreset } from './ImageCropDialog';
import './FileManager.css';

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
  { value: 'UNREFERENCED', label: '未引用' },
];

/** 这些分类仅用于筛选，不能作为上传分类 */
const UPLOADABLE_CATEGORIES = CATEGORIES.filter(
  (item) => item.value !== 'ALL' && item.value !== 'UNREFERENCED',
);

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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 24;
  const [uploadCategory, setUploadCategory] = useState('PRODUCT');
  const [uploadPreset, setUploadPreset] = useState<ProductImagePreset>(cropPreset ?? 'product-cover');
  const [selected, setSelected] = useState<string[]>(currentUrls);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const [tone, setTone] = useState<'success' | 'error' | 'info'>('info');
  const [cropQueue, setCropQueue] = useState<CropQueue | null>(null);
  const [dragging, setDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [renameFile, setRenameFile] = useState<FileItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmNode } = useConfirm();

  const notify = (message: string, nextTone: 'success' | 'error' | 'info' = 'info') => {
    setToast(message);
    setTone(nextTone);
  };

  const load = async () => {
    const q = new URLSearchParams({ category, page: String(page) });
    if (keyword) q.set('keyword', keyword);
    try {
      const result = category === 'UNREFERENCED'
        ? await api<{ list: FileItem[]; total: number }>(`/admin/files/unreferenced?page=${page}`)
        : await api<{ list: FileItem[]; total: number }>(`/admin/files?${q}`);
      setFiles(result.list ?? []);
      setTotal(Number(result.total ?? 0));
    } catch (error: any) {
      notify(error.message ?? '文件列表加载失败', 'error');
    }
  };
  useEffect(() => { void load(); }, [category, keyword, page]);

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
      notify(`成功上传并入库 ${uploaded.length} 个文件`, 'success');
    } catch (error: any) {
      notify(error.message ?? '上传失败', 'error');
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
      notify('商品素材选择器仅支持图片文件', 'error');
    } else if (!picker && uploadCategory !== 'PRODUCT') {
      await uploadOriginalFiles(chosen, uploadCategory);
    } else {
      if (otherFiles.length) await uploadOriginalFiles(otherFiles, 'OTHER');
      if (imageFiles.length) setCropQueue({ files: imageFiles, index: 0, preset });
      else if (!otherFiles.length) notify('请选择有效的图片文件', 'error');
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
      const uploaded = await sendFile(croppedFile, cropQueue.preset.startsWith('poster-') ? 'OTHER' : 'PRODUCT');
      await load();
      if (picker) setSelected((current) => current.includes(uploaded.url) ? current : [...current, uploaded.url]);
      notify(`已裁剪并入库：${uploaded.originalName}`, 'success');
      advanceCropQueue();
    } catch (error: any) {
      notify(error.message ?? '图片入库失败，请重试', 'error');
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id: string, url: string, name: string) => {
    const agreed = await confirm({
      title: `删除文件「${name}」？`,
      description: '删除后引用该素材的商品图可能失效，此操作不可撤销。',
      confirmText: '删除文件',
      tone: 'danger',
      confirmationText: `删除 ${name}`,
    });
    if (!agreed) return;
    try {
      await del(`/admin/files/${id}`);
      notify('文件已删除', 'success');
      setSelected((current) => current.filter((item) => item !== url));
      await load();
    } catch (error: any) { notify(error.message ?? '删除失败', 'error'); }
  };

  const beginRename = (file: FileItem) => {
    setRenameFile(file);
    setRenameValue(file.originalName);
  };

  const saveRename = async () => {
    if (!renameFile || renaming) return;
    const originalName = renameValue.trim();
    if (!originalName) {
      notify('请输入文件名称', 'error');
      return;
    }
    setRenaming(true);
    try {
      const updated = await patch<FileItem>(`/admin/files/${renameFile.id}`, { originalName });
      setFiles((current) => current.map((file) => String(file.id) === String(updated.id) ? { ...file, ...updated } : file));
      setRenameFile(null);
      notify('文件名称已更新', 'success');
      await load();
    } catch (error: any) {
      notify(error.message ?? '重命名失败', 'error');
    } finally {
      setRenaming(false);
    }
  };

  const copyFileUrl = async (file: FileItem) => {
    try {
      await navigator.clipboard.writeText(resolveAssetUrl(file.url));
      notify('文件链接已复制', 'success');
    } catch {
      notify('复制失败，请检查浏览器剪贴板权限', 'error');
    }
  };

  const downloadFile = async (file: FileItem) => {
    try {
      const response = await fetch(resolveAssetUrl(file.url));
      if (!response.ok) throw new Error('文件下载失败');
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = file.originalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error: any) {
      notify(error.message ?? '文件下载失败', 'error');
    }
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
        <PageHeader
          title="文件管理"
          description="统一管理商城图片素材；主图按 H5 展示比例裁剪，详情长图按内容自适应入库"
        />
      )}

      <div className={cx('grid gap-4', picker ? 'xl:grid-cols-[280px_minmax(0,1fr)]' : 'lg:grid-cols-4')}>
        <Card className={picker ? '' : 'lg:col-span-1'}>
          <CardHeader title="上传素材" icon={<UploadCloud size={15} />} />
          <div className="p-4">
            <p className="mb-3 text-xs leading-5 text-ink-muted">商品图片经预设裁剪后自动生成文件并写入素材库。</p>
            {!picker && (
              <Field label="文件分类" className="mb-3">
                <select className="admin-select" value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>
                  {UPLOADABLE_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </Field>
            )}

            {(!picker && uploadCategory === 'PRODUCT') && (
              <>
                <Field label="商城用途与输出尺寸" className="mb-2">
                  <select className="admin-select" value={uploadPreset} onChange={(event) => setUploadPreset(event.target.value as ProductImagePreset)}>
                    {Object.entries(PRODUCT_IMAGE_PRESETS).filter(([value]) => !value.startsWith('poster-')).map(([value, preset]) => (
                      <option key={value} value={value}>{preset.label}</option>
                    ))}
                  </select>
                </Field>
                <p className="mb-3 min-h-10 text-2xs leading-5 text-ink-faint">{activePresetInfo.description}</p>
              </>
            )}
            {picker && (
              <div className="notice notice-info mb-3">
                <div>
                  <div className="text-xs font-medium">{activePresetInfo.label}</div>
                  <p className="mt-1 text-2xs leading-5">{activePresetInfo.description}</p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
              onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFiles(event.dataTransfer.files); }}
              disabled={uploading || !!cropQueue}
              className={cx(
                'flex min-h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 py-7 text-center transition disabled:cursor-wait disabled:opacity-60',
                dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-raised hover:border-accent hover:bg-hover',
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-panel text-ink-3 shadow-xs">
                <UploadCloud size={19} />
              </span>
              <span className="mt-3 text-xs font-medium text-ink-2">{uploading ? '正在上传并入库…' : '拖放文件到此处，或点击浏览'}</span>
              <span className="mt-1 text-2xs text-ink-faint">图片、PDF、ZIP · 单个文件不超过 10 MB</span>
            </button>
            <input ref={fileRef} type="file" multiple accept={picker ? 'image/*' : 'image/*,.pdf,.zip'} className="hidden" onChange={(event) => void handleFiles(event.target.files ?? [])} />

            <div className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-2xs leading-5 text-ink-faint">
              <ImageIcon size={14} className="mt-0.5 shrink-0" />
              <span>{picker ? '裁剪完成后会自动选中，可继续多选现有素材再确认。' : '主图适配 H5 正方形展示；详情图保留长图比例。非商品素材保持原文件入库。'}</span>
            </div>
          </div>
        </Card>

        <Card className={picker ? '' : 'lg:col-span-3'}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <div className="flex flex-wrap items-center gap-1">
              {CATEGORIES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => { setCategory(item.value); setPage(1); }}
                  className={cx(
                    'rounded-md px-2.5 py-1 text-xs transition',
                    category === item.value
                      ? 'bg-accent-soft font-medium text-accent-ink'
                      : 'text-ink-3 hover:bg-hover hover:text-ink',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <SearchField
              className="ml-auto w-44"
              placeholder="搜索文件名"
              value={keyword}
                onChange={(event) => { setKeyword(event.target.value); setPage(1); }}
            />
            {picker && (
              <Button variant="primary" size="sm" onClick={confirmPick}>
                <Check size={14} /> 确认选择{selected.length ? ` (${selected.length})` : ''}
              </Button>
            )}
          </div>

          {visibleFiles.length === 0 ? (
            <Empty
              text={`暂无文件${picker ? '，可直接在左侧上传裁剪' : ''}`}
              description="支持 JPG / PNG / WEBP 图片，上传后可在此统一管理。"
              icon={<ImageIcon size={18} />}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 xl:grid-cols-4">
              {visibleFiles.map((file) => {
                const isSelected = selected.includes(file.url);
                const isImage = file.mimeType.startsWith('image/');
                return (
                  <div
                    key={file.id}
                    role={picker ? 'checkbox' : undefined}
                    aria-checked={picker ? isSelected : undefined}
                    tabIndex={picker ? 0 : undefined}
                    onKeyDown={picker ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(file.url); } } : undefined}
                    className={cx(
                      'group relative overflow-hidden rounded-lg border bg-panel transition',
                      isSelected ? 'border-accent ring-1 ring-accent/30' : 'border-line hover:border-line-strong',
                      picker && 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                    )}
                    onClick={() => picker && toggle(file.url)}
                  >
                    <div className="relative flex h-32 items-center justify-center border-b border-line bg-raised">
                      {isImage
                        ? <img src={resolveAssetUrl(file.url)} alt={file.originalName} className="h-full w-full object-contain" loading="lazy" />
                        : file.mimeType === 'application/zip'
                          ? <FileArchive size={28} className="text-ink-faint" aria-label="压缩文件" />
                          : <FileText size={28} className="text-ink-faint" aria-label="文件" />}
                      {!picker && (
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="file-preview-trigger absolute inset-0 flex items-end justify-center p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          aria-label={`查看文件 ${file.originalName}`}
                        >
                          <span className="flex items-center gap-1.5 rounded-md border border-line bg-panel/95 px-2.5 py-1.5 text-2xs font-medium text-ink shadow-xs">
                            <Eye size={13} aria-hidden="true" />点击查看
                          </span>
                        </button>
                      )}
                    </div>
                    <div className="p-2.5">
                      <div className="truncate text-2xs text-ink-2" title={file.originalName}>{file.originalName}</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="num text-2xs text-ink-faint">{(file.size / 1024).toFixed(0)} KB</span>
                        <Badge tone="neutral">{CATEGORIES.find((item) => item.value === file.category)?.label ?? file.category}</Badge>
                      </div>
                      {!picker && (
                        <div className="mt-2 flex items-center justify-end gap-1 border-t border-line pt-2">
                          <button
                            type="button"
                            onClick={() => beginRename(file)}
                            className="flex h-7 items-center gap-1 rounded-md px-2 text-2xs text-ink-muted transition hover:bg-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                            aria-label={`重命名文件 ${file.originalName}`}
                          >
                            <Pencil size={12} aria-hidden="true" />重命名
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(file.id, file.url, file.originalName)}
                            className="flex h-7 items-center gap-1 rounded-md px-2 text-2xs text-ink-muted transition hover:bg-danger-soft hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
                            aria-label={`删除文件 ${file.originalName}`}
                          >
                            <Trash2 size={12} aria-hidden="true" />删除
                          </button>
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-on">
                        <Check size={12} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {total > 0 && <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} unit="个文件" />}
        </Card>
      </div>

      {currentCropFile && cropQueue && (
        <ImageCropDialog
          key={`${currentCropFile.name}-${cropQueue.index}`}
          file={currentCropFile}
          preset={cropQueue.preset}
          progress={`正在处理第 ${cropQueue.index + 1} / ${cropQueue.files.length} 张图片`}
          busy={uploading}
          onCancel={advanceCropQueue}
          onConfirm={uploadCroppedFile}
        />
      )}
      {previewFile && (
        <Modal
          open
          onClose={() => setPreviewFile(null)}
          title={previewFile.originalName}
          description={`${previewFile.mimeType} · ${(previewFile.size / 1024).toFixed(0)} KB · ${CATEGORIES.find((item) => item.value === previewFile.category)?.label ?? previewFile.category}`}
          size="xl"
        >
          <div className="file-preview-stage">
            {previewFile.mimeType.startsWith('image/') ? (
              <img src={resolveAssetUrl(previewFile.url)} alt={previewFile.originalName} className="file-preview-image" />
            ) : previewFile.mimeType === 'application/pdf' ? (
              <iframe src={resolveAssetUrl(previewFile.url)} title={`预览 ${previewFile.originalName}`} className="file-preview-pdf" />
            ) : (
              <div className="file-preview-unsupported">
                {previewFile.mimeType === 'application/zip' ? <FileArchive size={38} /> : <FileText size={38} />}
                <strong>此文件类型不支持在线预览</strong>
                <span>可以下载原文件后在本地查看。</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => void copyFileUrl(previewFile)}><Copy size={14} />复制链接</Button>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => void downloadFile(previewFile)}><Download size={14} />下载文件</Button>
              <Button variant="primary" size="sm" onClick={() => setPreviewFile(null)}>关闭预览</Button>
            </div>
          </div>
        </Modal>
      )}
      {renameFile && (
        <Modal
          open
          onClose={() => setRenameFile(null)}
          title="重命名文件"
          description="更新素材库中显示的名称，不会更改文件路径或已有业务引用。"
          size="sm"
          footer={(
            <>
              <Button variant="secondary" onClick={() => setRenameFile(null)} disabled={renaming}>取消</Button>
              <Button variant="primary" onClick={() => void saveRename()} disabled={renaming || !renameValue.trim()}>
                {renaming ? '保存中…' : '保存名称'}
              </Button>
            </>
          )}
        >
          <Field label="文件名称" required hint="最多 255 个字符，不支持文件系统保留字符。">
            <input
              autoFocus
              className="input"
              value={renameValue}
              maxLength={255}
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void saveRename(); } }}
              placeholder="请输入文件名称"
            />
          </Field>
        </Modal>
      )}
      {confirmNode}
      {toast && <Toast message={toast} tone={tone} onClose={() => setToast('')} />}
    </>
  );
}
