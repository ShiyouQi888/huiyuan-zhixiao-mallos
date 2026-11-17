import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Image as ImageIcon, Move, RotateCcw, X, ZoomIn } from 'lucide-react';
import { Button } from '../components/ui';

export type ProductImagePreset = 'product-cover' | 'product-detail' | 'poster-background' | 'poster-image';

export const PRODUCT_IMAGE_PRESETS: Record<ProductImagePreset, {
  label: string;
  description: string;
  width: number;
  aspect: 'square' | 'source' | 'portrait';
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
  'poster-background': {
    label: '邀请海报背景',
    description: '1080 × 1920 px · 9:16 竖版，适配 H5 邀请海报',
    width: 1080,
    aspect: 'portrait',
  },
  'poster-image': {
    label: '邀请海报图片素材',
    description: '保留图片原始比例，透明 PNG / WebP 适用于品牌 Logo',
    width: 1080,
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
    : preset === 'poster-background'
      ? definition.width
      : Math.min(definition.width, Math.max(1, Math.round(crop.width)));
  let outputHeight = preset === 'product-cover'
    ? definition.width
    : preset === 'poster-background'
      ? 1920
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
    if (definition.aspect === 'square') return 1;
    if (definition.aspect === 'portrait') return 9 / 16;
    return natural.width / natural.height;
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
    : preset === 'poster-background'
      ? '1080 × 1920 px'
      : `${Math.min(definition.width, Math.max(1, Math.round(crop.width)))} × ${Math.max(1, Math.round(Math.min(definition.width, Math.max(1, Math.round(crop.width))) * crop.height / Math.max(1, crop.width)))} px`;

  return createPortal(
    <div className="modal-backdrop z-[100]" role="dialog" aria-modal="true" aria-labelledby="image-crop-title">
      <div className="flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-1.5 text-2xs font-medium text-accent-ink">
              <ImageIcon size={14} /> {preset.startsWith('poster-') ? '邀请海报素材处理' : '商品图片处理'}
            </div>
            <h2 id="image-crop-title" className="mt-1 text-base font-semibold text-ink">{definition.label}裁剪</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">{definition.description}</p>
          </div>
          <button
            type="button"
            aria-label="关闭裁剪"
            disabled={busy}
            onClick={onCancel}
            className="modal-close"
          >
            <X size={17} />
          </button>
        </header>

        <div className="grid min-h-0 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <section ref={stageRef} className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-line bg-canvas p-4">
            {objectUrl && <img ref={imageRef} src={objectUrl} alt="待裁剪图片" onLoad={onImageLoad} className="hidden" />}
            {preview.width > 0 ? (
              <div className="relative shrink-0 overflow-hidden bg-black/40" style={{ width: preview.width, height: preview.height }}>
                <img src={objectUrl} alt="待裁剪图片预览" draggable={false} className="block h-full w-full select-none object-fill" />
                <div
                  className="absolute touch-none cursor-move border-2 border-white shadow-[0_0_0_999px_rgba(2,6,23,0.6)]"
                  style={{
                    left: crop.x * preview.scale,
                    top: crop.y * preview.scale,
                    width: crop.width * preview.scale,
                    height: crop.height * preview.scale,
                    outline: '1px solid rgb(var(--accent-rgb) / .9)',
                  }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, cropX: crop.x, cropY: crop.y };
                  }}
                  onPointerMove={moveCrop}
                  onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; }}
                  onPointerCancel={() => { dragRef.current = null; }}
                >
                  <span className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                    {Array.from({ length: 9 }, (_, index) => <i key={index} className="border border-white/25" />)}
                  </span>
                  <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded bg-black/65 px-2 py-1 text-2xs text-white">
                    <Move size={11} /> 拖动调整构图
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-ink-faint">
                <ImageIcon size={26} /> 正在读取图片…
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="subtle-panel p-3.5">
              <div className="text-xs font-medium text-ink-2">输出规格</div>
              <div className="mt-2.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">裁剪尺寸</span>
                  <strong className="num font-medium text-ink">{outputSize}</strong>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">源文件</span>
                  <span className="max-w-32 truncate text-ink-2" title={file.name}>{file.name}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-faint">原始分辨率</span>
                  <span className="num text-ink-2">{natural.width ? `${natural.width} × ${natural.height}` : '读取中'}</span>
                </div>
              </div>
            </div>

            <div className="subtle-panel p-3.5">
              <label htmlFor="crop-zoom" className="flex items-center justify-between text-xs font-medium text-ink-2">
                <span className="flex items-center gap-1.5"><ZoomIn size={13} /> 裁剪范围</span>
                <span className="num text-ink-muted">{zoom}%</span>
              </label>
              <input
                id="crop-zoom"
                type="range"
                min="45"
                max="100"
                step="1"
                value={zoom}
                onChange={(event) => updateZoom(Number(event.target.value))}
                className="mt-3 w-full accent-[var(--accent)]"
              />
              <div className="mt-1 flex justify-between text-2xs text-ink-faint">
                <span>裁剪更多</span>
                <span>保留更多画面</span>
              </div>
              <p className="mt-3 text-2xs leading-5 text-ink-faint">拖动选框调整图片主体位置。详情图默认保留原图比例，适配 H5 全宽展示。</p>
              <button
                type="button"
                onClick={() => updateZoom(100)}
                className="mt-2 inline-flex items-center gap-1.5 text-2xs text-accent-ink transition hover:opacity-80"
              >
                <RotateCcw size={12} /> 恢复完整构图
              </button>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          <span className={error ? 'text-xs text-danger' : 'text-xs text-ink-faint'}>
            {error || progress || '裁剪完成后会自动上传并写入文件库'}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>跳过此图</Button>
            <Button variant="primary" size="sm" disabled={busy || !natural.width} onClick={finishCrop}>
              <Check size={14} /> {busy ? '处理中…' : '裁剪并入库'}
            </Button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
