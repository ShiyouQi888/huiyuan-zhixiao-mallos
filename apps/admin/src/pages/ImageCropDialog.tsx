import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Image as ImageIcon, Move, RotateCcw, X, ZoomIn } from 'lucide-react';

export type ProductImagePreset = 'product-cover' | 'product-detail';

export const PRODUCT_IMAGE_PRESETS: Record<ProductImagePreset, {
  label: string;
  description: string;
  width: number;
  aspect: 'square' | 'source';
}> = {
  'product-cover': {
    label: '商品主图',
    description: '800 × 800 px · 1:1 正方形，适配商品卡片与详情页轮播',
    width: 800,
    aspect: 'square',
  },
  'product-detail': {
    label: '详情长图',
    description: '750 px 宽 · 高度按裁剪内容自适应，源图较小时不放大',
    width: 750,
    aspect: 'source',
  },
};

type CropRect = { x: number; y: number; width: number; height: number };
type Props = {
  file: File;
  preset: ProductImagePreset;
  progress?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function exportCrop(file: File, image: HTMLImageElement, crop: CropRect, preset: ProductImagePreset): Promise<File> {
  const definition = PRODUCT_IMAGE_PRESETS[preset];
  let outputWidth = preset === 'product-cover'
    ? definition.width
    : Math.min(definition.width, Math.max(1, Math.round(crop.width)));
  let outputHeight = preset === 'product-cover'
    ? definition.width
    : Math.max(1, Math.round(outputWidth * crop.height / crop.width));

  // Keep unusually long detail images within a safe canvas allocation while preserving ratio.
  if (outputHeight > 10000) {
    outputWidth = Math.max(1, Math.floor(outputWidth * 10000 / outputHeight));
    outputHeight = Math.max(1, Math.round(outputWidth * crop.height / crop.width));
  }

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('当前浏览器无法处理图片'));
  const outputType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  if (outputType === 'image/jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('图片生成失败，请更换图片后重试'));
      const actualType = blob.type || outputType;
      const extension = actualType === 'image/png' ? 'png' : actualType === 'image/webp' ? 'webp' : 'jpg';
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'product-image';
      const dimensionLabel = preset === 'product-cover' ? '800x800' : `${outputWidth}x${outputHeight}`;
      resolve(new File([blob], `${baseName}-${dimensionLabel}.${extension}`, { type: actualType, lastModified: Date.now() }));
    }, outputType, outputType === 'image/jpeg' ? 0.92 : undefined);
  });
}

export function ImageCropDialog({ file, preset, progress, busy = false, onCancel, onConfirm }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; clientX: number; clientY: number; cropX: number; cropY: number } | null>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [stageMaxWidth, setStageMaxWidth] = useState(560);
  const [zoom, setZoom] = useState(100);
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [error, setError] = useState('');
  const definition = PRODUCT_IMAGE_PRESETS[preset];
  const ratio = useMemo(() => {
    if (!natural.width || !natural.height) return 1;
    return definition.aspect === 'square' ? 1 : natural.width / natural.height;
  }, [definition.aspect, natural.height, natural.width]);
  const preview = useMemo(() => {
    if (!natural.width || !natural.height) return { width: 0, height: 0, scale: 0 };
    const scale = Math.min(560 / natural.width, 420 / natural.height, stageMaxWidth / natural.width);
    return { width: natural.width * scale, height: natural.height * scale, scale };
  }, [natural.height, natural.width, stageMaxWidth]);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setNatural({ width: 0, height: 0 });
    setZoom(100);
    setError('');
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!natural.width || !natural.height) return;
    const maxWidth = Math.min(natural.width, natural.height * ratio);
    const maxHeight = maxWidth / ratio;
    setCrop({ x: (natural.width - maxWidth) / 2, y: (natural.height - maxHeight) / 2, width: maxWidth, height: maxHeight });
  }, [natural.height, natural.width, preset, ratio]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateWidth = () => setStageMaxWidth(Math.max(120, stage.clientWidth - 34));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const onImageLoad = () => {
    const image = imageRef.current;
    if (image) setNatural({ width: image.naturalWidth, height: image.naturalHeight });
  };

  const moveCrop = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !preview.scale) return;
    const width = crop.width;
    const height = crop.height;
    const x = clamp(drag.cropX + (event.clientX - drag.clientX) / preview.scale, 0, natural.width - width);
    const y = clamp(drag.cropY + (event.clientY - drag.clientY) / preview.scale, 0, natural.height - height);
    setCrop((current) => ({ ...current, x, y }));
  };

  const updateZoom = (nextZoom: number) => {
    if (!natural.width || !natural.height) return;
    const maxWidth = Math.min(natural.width, natural.height * ratio);
    const maxHeight = maxWidth / ratio;
    const width = maxWidth * nextZoom / 100;
    const height = maxHeight * nextZoom / 100;
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;
    setCrop({
      x: clamp(centerX - width / 2, 0, natural.width - width),
      y: clamp(centerY - height / 2, 0, natural.height - height),
      width,
      height,
    });
    setZoom(nextZoom);
  };

  const finishCrop = async () => {
    const image = imageRef.current;
    if (!image || !crop.width || !crop.height) return;
    try {
      setError('');
      onConfirm(await exportCrop(file, image, crop, preset));
    } catch (error) {
      setError(error instanceof Error ? error.message : '图片处理失败');
    }
  };

  const outputSize = preset === 'product-cover'
    ? '800 × 800 px'
    : `${Math.min(definition.width, Math.max(1, Math.round(crop.width)))} × ${Math.max(1, Math.round(Math.min(definition.width, Math.max(1, Math.round(crop.width))) * crop.height / Math.max(1, crop.width)))} px`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="image-crop-title">
      <div className="flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-900 shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-indigo-300"><ImageIcon size={15} /> 商品图片处理</div>
            <h2 id="image-crop-title" className="mt-1 text-lg font-semibold text-white">{definition.label}裁剪</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">{definition.description}</p>
          </div>
          <button type="button" aria-label="关闭裁剪" disabled={busy} onClick={onCancel} className="rounded-lg p-2 text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"><X size={18} /></button>
        </header>

        <div className="grid min-h-0 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1fr)_250px]">
          <section ref={stageRef} className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-white/[0.06] bg-surface-950 p-4">
            {objectUrl && <img ref={imageRef} src={objectUrl} alt="待裁剪图片" onLoad={onImageLoad} className="hidden" />}
            {preview.width > 0 ? (
                <div className="relative shrink-0 overflow-hidden bg-black/30" style={{ width: preview.width, height: preview.height }}>
                <img src={objectUrl} alt="待裁剪图片预览" draggable={false} className="block h-full w-full select-none object-fill" />
                <div
                  className="absolute touch-none cursor-move border-2 border-white shadow-[0_0_0_999px_rgba(2,6,23,0.62)]"
                  style={{
                    left: crop.x * preview.scale,
                    top: crop.y * preview.scale,
                    width: crop.width * preview.scale,
                    height: crop.height * preview.scale,
                    outline: '1px solid rgba(79,70,229,.9)',
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, cropX: crop.x, cropY: crop.y };
                  }}
                  onPointerMove={moveCrop}
                  onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; }}
                  onPointerCancel={() => { dragRef.current = null; }}
                >
                  <span className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    {Array.from({ length: 9 }, (_, index) => <i key={index} className="border border-white/25" />)}
                  </span>
                  <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-md bg-black/65 px-2 py-1 text-[10px] text-white"><Move size={11} /> 拖动调整构图</span>
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-slate-500"><ImageIcon size={28} />正在读取图片…</div>
            )}
          </section>

          <aside className="space-y-5">
            <div className="rounded-xl border border-white/[0.06] bg-surface-850 p-4">
              <div className="text-xs font-semibold text-slate-300">输出规格</div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">裁剪尺寸</span><strong className="font-medium text-white">{outputSize}</strong></div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">源文件</span><span className="max-w-36 truncate text-slate-300" title={file.name}>{file.name}</span></div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">原始分辨率</span><span className="text-slate-300">{natural.width ? `${natural.width} × ${natural.height} px` : '读取中'}</span></div>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-surface-850 p-4">
              <label htmlFor="crop-zoom" className="flex items-center justify-between text-xs font-semibold text-slate-300"><span className="flex items-center gap-2"><ZoomIn size={14} /> 裁剪范围</span><span className="font-normal text-slate-500">{zoom}%</span></label>
              <input id="crop-zoom" type="range" min="45" max="100" step="1" value={zoom} onChange={(event) => updateZoom(Number(event.target.value))} className="mt-4 w-full accent-indigo-500" />
              <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>裁剪更多</span><span>保留更多画面</span></div>
              <p className="mt-4 text-[11px] leading-5 text-slate-500">拖动选框调整图片主体位置。详情图默认保留原图比例，适配 H5 全宽展示。</p>
              <button type="button" onClick={() => updateZoom(100)} className="mt-3 inline-flex items-center gap-1.5 text-xs text-indigo-300 transition hover:text-indigo-200"><RotateCcw size={13} />恢复完整构图</button>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] px-6 py-4">
          <span className={`text-xs ${error ? 'text-rose-400' : 'text-slate-500'}`}>{error || progress || '裁剪完成后会自动上传并写入文件库'}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={onCancel} className="btn-ghost">跳过此图</button>
            <button type="button" disabled={busy || !natural.width} onClick={finishCrop} className="btn-primary"><Check size={15} />{busy ? '处理中…' : '裁剪并入库'}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
