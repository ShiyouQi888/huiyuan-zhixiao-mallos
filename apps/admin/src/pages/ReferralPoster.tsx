import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, ImagePlus, QrCode, Save, Trash2, Type,
} from 'lucide-react';
import { api, put, resolveAssetUrl } from '../api';
import {
  Button, Card, CardHeader, Empty, ErrorBlock, Field, LoadingBlock, PageHeader, Toast, cx, useConfirm,
} from '../components/ui';
import { FileManager } from './FileManager';
import {
  DEFAULT_REFERRAL_POSTER_TEMPLATE,
  type ReferralPosterLayer,
  type ReferralPosterTemplate,
  type ReferralPosterTextLayer,
} from '../../../../packages/shared/src/referral-poster';

interface PosterApiData {
  template: ReferralPosterTemplate;
  sampleQrCode: string;
  sampleData: { nickname: string; inviteCode: string; url: string };
}

interface DragOrigin {
  id: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  x: number;
  y: number;
}

interface ResizeOrigin {
  id: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

type PickerTarget = { kind: 'background' } | { kind: 'new-image' } | { kind: 'image'; id: string };

const RESIZE_HANDLES = [
  { dx: -1, dy: -1, position: 'left-0 top-0', cursor: 'cursor-nwse-resize', label: '左上' },
  { dx: 0, dy: -1, position: 'left-1/2 top-0 -translate-x-1/2', cursor: 'cursor-ns-resize', label: '上' },
  { dx: 1, dy: -1, position: 'right-0 top-0', cursor: 'cursor-nesw-resize', label: '右上' },
  { dx: -1, dy: 0, position: 'left-0 top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize', label: '左' },
  { dx: 1, dy: 0, position: 'right-0 top-1/2 -translate-y-1/2', cursor: 'cursor-ew-resize', label: '右' },
  { dx: -1, dy: 1, position: 'bottom-0 left-0', cursor: 'cursor-nesw-resize', label: '左下' },
  { dx: 0, dy: 1, position: 'bottom-0 left-1/2 -translate-x-1/2', cursor: 'cursor-ns-resize', label: '下' },
  { dx: 1, dy: 1, position: 'bottom-0 right-0', cursor: 'cursor-nwse-resize', label: '右下' },
] as const;

const CANVAS_WIDTH = DEFAULT_REFERRAL_POSTER_TEMPLATE.width;
const CANVAS_HEIGHT = DEFAULT_REFERRAL_POSTER_TEMPLATE.height;
const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function interpolate(text: string, data: PosterApiData['sampleData']) {
  return text.replace(/\{(nickname|inviteCode|url)\}/g, (_, key: keyof PosterApiData['sampleData']) => data[key]);
}

export function ReferralPoster() {
  const [template, setTemplate] = useState<ReferralPosterTemplate>(DEFAULT_REFERRAL_POSTER_TEMPLATE);
  const [sampleQrCode, setSampleQrCode] = useState('');
  const [sampleData, setSampleData] = useState<PosterApiData['sampleData']>({ nickname: '演示会员', inviteCode: 'SL-DEMO', url: 'https://example.com/#/register?code=SL-DEMO' });
  const [selectedId, setSelectedId] = useState('invite-qrcode');
  const { confirm, confirmNode } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOrigin | null>(null);
  const resizeRef = useRef<ResizeOrigin | null>(null);

  const selectedLayer = useMemo(() => template.layers.find((layer) => layer.id === selectedId) ?? null, [selectedId, template.layers]);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await api<PosterApiData>('/admin/referral/poster');
      setTemplate(JSON.parse(JSON.stringify(result.template)) as ReferralPosterTemplate);
      setSampleQrCode(result.sampleQrCode);
      setSampleData(result.sampleData);
      setSelectedId(result.template.layers[0]?.id ?? '');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '邀请海报配置加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const updateLayer = (id: string, patch: Partial<ReferralPosterLayer>) => {
    setTemplate((current) => ({
      ...current,
      layers: current.layers.map((layer) => layer.id === id ? { ...layer, ...patch } as ReferralPosterLayer : layer),
    }));
  };

  const updateTextLayer = (id: string, patch: Partial<ReferralPosterTextLayer>) => updateLayer(id, patch);

  const addTextLayer = () => {
    if (template.layers.length >= 32) { setToast('最多支持 32 个海报图层'); return; }
    const id = newId('text');
    setTemplate((current) => ({
      ...current,
      layers: [...current.layers, {
        id, type: 'text', x: 40, y: 320, width: 280, height: 44,
        text: '新增邀请文案', fontSize: 18, fontWeight: 600, color: '#344054', align: 'center',
      }],
    }));
    setSelectedId(id);
  };

  const addQrLayer = () => {
    if (template.layers.length >= 32) { setToast('最多支持 32 个海报图层'); return; }
    const id = newId('qr');
    setTemplate((current) => ({
      ...current,
      layers: [...current.layers, { id, type: 'qrcode', x: 102, y: 188, width: 156, height: 156 }],
    }));
    setSelectedId(id);
  };

  const addImageLayer = () => {
    if (template.layers.length >= 32) { setToast('最多支持 32 个海报图层'); return; }
    setPickerTarget({ kind: 'new-image' });
  };

  const chooseLayerImage = (id: string) => setPickerTarget({ kind: 'image', id });

  const acceptPickedImage = (urls: string[]) => {
    const url = urls.at(-1);
    if (url && pickerTarget?.kind === 'background') {
      setTemplate((current) => ({ ...current, backgroundImageUrl: url }));
    } else if (url && pickerTarget?.kind === 'image') {
      updateLayer(pickerTarget.id, { src: url });
    } else if (url && pickerTarget?.kind === 'new-image') {
      const id = newId('image');
      setTemplate((current) => ({
        ...current,
        layers: [...current.layers, {
          id, type: 'image', x: 120, y: 130, width: 120, height: 100,
          src: url, fit: 'contain', opacity: 1,
        }],
      }));
      setSelectedId(id);
    }
    setPickerTarget(null);
  };

  const removeSelected = async () => {
    if (!selectedLayer) return;
    if (selectedLayer.type === 'qrcode' && template.layers.filter((layer) => layer.type === 'qrcode').length <= 1) {
      setToast('海报至少需要保留一个二维码');
      return;
    }
    const layerName = selectedLayer.type === 'text'
      ? selectedLayer.text
      : selectedLayer.type === 'image'
        ? selectedLayer.src.split('/').at(-1) ?? '图片'
        : '二维码';
    const agreed = await confirm({
      title: '确认删除海报图层？',
      description: `将从当前海报草稿中移除「${layerName}」，保存模板后会员端海报才会同步更新。`,
      confirmText: '删除图层',
      tone: 'danger',
      confirmationText: `删除图层 ${layerName}`,
    });
    if (!agreed) return;
    const next = template.layers.filter((layer) => layer.id !== selectedLayer.id);
    setTemplate((current) => ({ ...current, layers: next }));
    setSelectedId(next.at(-1)?.id ?? '');
  };

  const moveLayerOrder = (direction: -1 | 1) => {
    if (!selectedLayer) return;
    setTemplate((current) => {
      const index = current.layers.findIndex((layer) => layer.id === selectedLayer.id);
      const target = clamp(index + direction, 0, current.layers.length - 1);
      if (target === index) return current;
      const layers = [...current.layers];
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return { ...current, layers };
    });
  };

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, layer: ReferralPosterLayer) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(layer.id);
    dragRef.current = {
      id: layer.id, pointerId: event.pointerId,
      clientX: event.clientX, clientY: event.clientY, x: layer.x, y: layer.y,
    };
  };

  const startResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    layer: ReferralPosterLayer,
    dx: -1 | 0 | 1,
    dy: -1 | 0 | 1,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(layer.id);
    dragRef.current = null;
    resizeRef.current = {
      id: layer.id, pointerId: event.pointerId,
      clientX: event.clientX, clientY: event.clientY,
      x: layer.x, y: layer.y, width: layer.width, height: layer.height, dx, dy,
    };
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!resize || resize.pointerId !== event.pointerId || !rect) return;
    const layer = template.layers.find((item) => item.id === resize.id);
    if (!layer) return;

    const deltaX = (event.clientX - resize.clientX) / (rect.width / CANVAS_WIDTH);
    const deltaY = (event.clientY - resize.clientY) / (rect.height / CANVAS_HEIGHT);
    const minWidth = layer.type === 'qrcode' ? 64 : layer.type === 'text' ? 20 : 12;
    const minHeight = layer.type === 'qrcode' ? 64 : 12;

    if (layer.type === 'text') {
      let x = resize.x;
      let y = resize.y;
      let width = resize.width;
      let height = resize.height;

      if (resize.dx === -1) {
        x = clamp(resize.x + deltaX, 0, resize.x + resize.width - minWidth);
        width = resize.x + resize.width - x;
      } else if (resize.dx === 1) {
        width = clamp(resize.width + deltaX, minWidth, CANVAS_WIDTH - resize.x);
      }
      if (resize.dy === -1) {
        y = clamp(resize.y + deltaY, 0, resize.y + resize.height - minHeight);
        height = resize.y + resize.height - y;
      } else if (resize.dy === 1) {
        height = clamp(resize.height + deltaY, minHeight, CANVAS_HEIGHT - resize.y);
      }

      updateLayer(resize.id, {
        x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height),
      });
      return;
    }

    const desiredWidth = resize.width + resize.dx * deltaX;
    const desiredHeight = resize.height + resize.dy * deltaY;
    const widthScale = desiredWidth / resize.width;
    const heightScale = desiredHeight / resize.height;
    const useWidth = resize.dx !== 0 && (resize.dy === 0 || Math.abs(widthScale - 1) >= Math.abs(heightScale - 1));
    let scale = resize.dx === 0 ? heightScale : resize.dy === 0 ? widthScale : useWidth ? widthScale : heightScale;

    const anchorX = resize.dx === 1 ? resize.x : resize.dx === -1 ? resize.x + resize.width : resize.x + resize.width / 2;
    const anchorY = resize.dy === 1 ? resize.y : resize.dy === -1 ? resize.y + resize.height : resize.y + resize.height / 2;
    const maxWidth = resize.dx === 1 ? CANVAS_WIDTH - anchorX : resize.dx === -1 ? anchorX : Math.min(anchorX, CANVAS_WIDTH - anchorX) * 2;
    const maxHeight = resize.dy === 1 ? CANVAS_HEIGHT - anchorY : resize.dy === -1 ? anchorY : Math.min(anchorY, CANVAS_HEIGHT - anchorY) * 2;
    const minScale = Math.max(minWidth / resize.width, minHeight / resize.height);
    const maxScale = Math.min(maxWidth / resize.width, maxHeight / resize.height);
    scale = clamp(scale, minScale, maxScale);

    const width = resize.width * scale;
    const height = resize.height * scale;
    const x = resize.dx === 1 ? anchorX : resize.dx === -1 ? anchorX - width : anchorX - width / 2;
    const y = resize.dy === 1 ? anchorY : resize.dy === -1 ? anchorY - height : anchorY - height / 2;
    updateLayer(resize.id, {
      x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height),
    });
  };

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current) moveResize(event);
    else moveDrag(event);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !rect) return;
    const layer = template.layers.find((item) => item.id === drag.id);
    if (!layer) return;
    const scaleX = rect.width / CANVAS_WIDTH;
    const scaleY = rect.height / CANVAS_HEIGHT;
    updateLayer(drag.id, {
      x: Math.round(clamp(drag.x + (event.clientX - drag.clientX) / scaleX, 0, CANVAS_WIDTH - layer.width)),
      y: Math.round(clamp(drag.y + (event.clientY - drag.clientY) / scaleY, 0, CANVAS_HEIGHT - layer.height)),
    });
  };

  const endGesture = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null;
  };

  const save = async () => {
    const agreed = await confirm({
      title: '确认发布邀请海报模板？',
      description: '保存后会员端邀请海报会立即使用当前背景、图片与文字布局。',
      confirmText: '确认发布模板',
      confirmationText: '发布邀请海报模板',
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const result = await put<{ template: ReferralPosterTemplate }>('/admin/referral/poster', { template });
      setTemplate(result.template);
      setToast('邀请海报模板已保存，H5 端立即生效');
    } catch (error) {
      setToast(error instanceof Error ? error.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const removeBackgroundImage = async () => {
    if (!template.backgroundImageUrl) return;
    const agreed = await confirm({
      title: '确认移除海报背景图片？',
      description: '移除后当前模板预览会使用纯色背景；保存模板后会员端海报同步更新。',
      confirmText: '确认移除背景',
      tone: 'danger',
      confirmationText: '移除背景图片',
    });
    if (!agreed) return;
    setTemplate((current) => ({ ...current, backgroundImageUrl: null }));
  };

  const changePosition = (key: 'x' | 'y' | 'width' | 'height', raw: string) => {
    if (!selectedLayer) return;
    if (!raw.trim()) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const next = Math.round(value);
    if (key === 'x') updateLayer(selectedLayer.id, { x: clamp(next, 0, CANVAS_WIDTH - selectedLayer.width) });
    else if (key === 'y') updateLayer(selectedLayer.id, { y: clamp(next, 0, CANVAS_HEIGHT - selectedLayer.height) });
    else if (key === 'width') updateLayer(selectedLayer.id, { width: clamp(next, selectedLayer.type === 'qrcode' ? 64 : selectedLayer.type === 'text' ? 20 : 12, CANVAS_WIDTH - selectedLayer.x) });
    else updateLayer(selectedLayer.id, { height: clamp(next, selectedLayer.type === 'qrcode' ? 64 : 12, CANVAS_HEIGHT - selectedLayer.y) });
  };

  const backgroundStyle = template.backgroundImageUrl
    ? { backgroundImage: `url("${resolveAssetUrl(template.backgroundImageUrl)}")`, backgroundPosition: 'center', backgroundSize: 'cover' }
    : {};
  const pickerImageSource = pickerTarget?.kind === 'image'
    ? template.layers.find((layer) => layer.id === pickerTarget.id && layer.type === 'image')
    : undefined;
  const pickerCurrentUrls = pickerTarget?.kind === 'background'
    ? (template.backgroundImageUrl ? [template.backgroundImageUrl] : [])
    : pickerImageSource && 'src' in pickerImageSource ? [pickerImageSource.src] : [];

  return (
    <>
      <PageHeader
        title="邀请海报"
        description="设置 H5 邀请海报的背景、Logo 图片、二维码和文字图层；保存后会员生成海报时立即使用。"
        action={(
          <>
            <Button variant="secondary" onClick={addTextLayer}><Type size={14} /> 添加文字</Button>
            <Button variant="secondary" onClick={addQrLayer}><QrCode size={14} /> 添加二维码</Button>
            <Button variant="secondary" onClick={addImageLayer}><ImagePlus size={14} /> 添加图片</Button>
            <Button variant="primary" disabled={saving || loading || !!loadError} onClick={() => void save()}>
              <Save size={14} /> {saving ? '保存中…' : '保存模板'}
            </Button>
          </>
        )}
      />

      {loading ? <LoadingBlock text="正在加载海报模板…" /> : loadError ? (
        <Card><ErrorBlock text={loadError} action={<Button size="sm" onClick={() => void load()}>重试</Button>} /></Card>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="overflow-hidden">
            <CardHeader
              title="海报画布"
              description="拖动图层调整位置；选中后拖拽边框控制点即可缩放。图片与二维码保持比例，文字框可自由调整。"
              icon={<ImagePlus size={15} />}
            />
            <div className="overflow-auto bg-raised px-4 py-5">
              <div className="mx-auto w-fit rounded-xl border border-line-strong p-1.5 shadow-card">
                <div
                  ref={canvasRef}
                  className="relative h-[640px] w-[360px] touch-none select-none overflow-hidden"
                  style={{ backgroundColor: template.backgroundColor, ...backgroundStyle }}
                  onPointerMove={movePointer}
                  onPointerUp={endGesture}
                  onPointerCancel={endGesture}
                >
                  {template.layers.map((layer, index) => (
                    <div
                      key={layer.id}
                      className={cx(
                        'absolute flex cursor-move touch-none items-center overflow-visible',
                        selectedId === layer.id ? 'z-20 ring-2 ring-accent ring-offset-1 ring-offset-transparent' : 'z-10 hover:outline hover:outline-1 hover:outline-accent/60',
                      )}
                      style={{
                        left: layer.x, top: layer.y, width: layer.width, height: layer.height,
                        zIndex: index + 1,
                        justifyContent: layer.type === 'text' ? (layer.align === 'left' ? 'flex-start' : layer.align === 'right' ? 'flex-end' : 'center') : 'center',
                      }}
                      onPointerDown={(event) => startDrag(event, layer)}
                        title={layer.type === 'text' ? interpolate(layer.text, sampleData) : layer.type === 'qrcode' ? '会员专属二维码' : '海报图片素材'}
                    >
                      {layer.type === 'text' ? (
                        <span
                          className="block h-full w-full overflow-hidden whitespace-pre-wrap break-words px-1 text-center leading-tight"
                          style={{ color: layer.color, fontSize: layer.fontSize, fontWeight: layer.fontWeight, textAlign: layer.align }}
                        >
                          {interpolate(layer.text, sampleData)}
                        </span>
                      ) : layer.type === 'qrcode' ? (
                        <div className="flex h-full w-full items-center justify-center overflow-hidden bg-white p-1.5">
                          {sampleQrCode ? <img className="h-full w-full object-contain" src={sampleQrCode} alt="二维码预览" draggable={false} /> : <QrCode className="h-2/3 w-2/3 text-ink" />}
                        </div>
                      ) : (
                        <img
                          className="h-full w-full"
                          src={resolveAssetUrl(layer.src)}
                          alt="海报图片素材"
                          draggable={false}
                          style={{ objectFit: layer.fit, opacity: layer.opacity }}
                        />
                      )}
                      {selectedId === layer.id && RESIZE_HANDLES.map((handle) => (
                        <button
                          key={`${handle.dx}-${handle.dy}`}
                          type="button"
                          aria-label={`缩放图层：${handle.label}`}
                          title={`拖拽${handle.label}控制点缩放`}
                          className={cx(
                            'absolute z-30 h-3 w-3 touch-none rounded-[3px] border-2 border-white bg-accent shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
                            handle.position, handle.cursor,
                          )}
                          onPointerDown={(event) => startResize(event, layer, handle.dx, handle.dy)}
                          onPointerUp={endGesture}
                          onPointerCancel={endGesture}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mx-auto mt-3 max-w-[360px] text-center text-2xs leading-5 text-ink-faint">
                预览使用演示会员信息；H5 生成时会替换为当前会员的昵称、邀请码和二维码。
              </div>
            </div>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader
                title="图层与样式"
                description="图层按列表顺序绘制，可调整前后层级。"
                icon={<Type size={15} />}
                action={selectedLayer ? (
                  <div className="flex gap-1">
                    <Button size="xs" variant="ghost" iconOnly aria-label="下移图层" title="下移图层" onClick={() => moveLayerOrder(-1)}><ArrowDown size={14} /></Button>
                    <Button size="xs" variant="ghost" iconOnly aria-label="上移图层" title="上移图层" onClick={() => moveLayerOrder(1)}><ArrowUp size={14} /></Button>
                    <Button size="xs" variant="ghost" iconOnly aria-label="删除图层" title="删除图层" onClick={removeSelected}><Trash2 size={14} /></Button>
                  </div>
                ) : undefined}
              />
              <div className="max-h-40 space-y-1 overflow-auto border-b border-line px-3 pb-3">
                {template.layers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => setSelectedId(layer.id)}
                    className={cx(
                      'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition',
                      selectedId === layer.id ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-hover',
                    )}
                  >
                    {layer.type === 'text' ? <Type size={13} /> : layer.type === 'qrcode' ? <QrCode size={13} /> : <ImagePlus size={13} />}
                    <span className="min-w-0 flex-1 truncate">{layer.type === 'text' ? interpolate(layer.text, sampleData) : layer.type === 'qrcode' ? '会员专属二维码' : `图片 · ${layer.src.split('/').at(-1) ?? 'Logo'}`}</span>
                  </button>
                ))}
              </div>
              {!selectedLayer ? (
                <Empty text="选择或添加图层" />
              ) : (
                <div className="space-y-3 p-3">
                  {selectedLayer.type === 'text' && (
                    <>
                      <Field label="文字内容" hint="支持 {nickname}、{inviteCode}、{url} 动态变量">
                        <textarea
                          className="textarea min-h-20 resize-y text-sm"
                          maxLength={240}
                          value={selectedLayer.text}
                          onChange={(event) => updateTextLayer(selectedLayer.id, { text: event.target.value })}
                        />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="字号（px）">
                          <input className="input" type="number" min={8} max={128} value={selectedLayer.fontSize} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) updateTextLayer(selectedLayer.id, { fontSize: clamp(value, 8, 128) }); }} />
                        </Field>
                        <Field label="字重">
                          <select className="admin-select" value={selectedLayer.fontWeight} onChange={(event) => updateTextLayer(selectedLayer.id, { fontWeight: Number(event.target.value) as ReferralPosterTextLayer['fontWeight'] })}>
                            <option value={400}>常规</option><option value={500}>中等</option><option value={600}>半粗</option><option value={700}>粗体</option>
                          </select>
                        </Field>
                      </div>
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                        <Field label="文字颜色">
                          <input className="input h-9 p-1" type="color" value={selectedLayer.color} onChange={(event) => updateTextLayer(selectedLayer.id, { color: event.target.value.toUpperCase() })} />
                        </Field>
                        <div className="flex h-9 items-center rounded-md border border-line bg-panel p-0.5">
                          {([
                            ['left', AlignLeft, '左对齐'], ['center', AlignCenter, '居中'], ['right', AlignRight, '右对齐'],
                          ] as const).map(([align, Icon, label]) => (
                            <Button key={align} size="xs" variant={selectedLayer.align === align ? 'secondary' : 'ghost'} iconOnly aria-label={label} title={label} onClick={() => updateTextLayer(selectedLayer.id, { align })}><Icon size={14} /></Button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {selectedLayer.type === 'image' && (
                    <>
                      <Field label="图片素材" hint="建议使用透明 PNG / WebP 品牌 Logo。">
                        <div className="flex items-center gap-2 rounded-md border border-line bg-raised p-2">
                          <img src={resolveAssetUrl(selectedLayer.src)} alt="当前图片素材" className="h-12 w-16 rounded bg-panel object-contain" />
                          <span className="min-w-0 flex-1 truncate text-2xs text-ink-faint">{selectedLayer.src.split('/').at(-1)}</span>
                          <Button size="xs" variant="secondary" onClick={() => chooseLayerImage(selectedLayer.id)}>更换</Button>
                        </div>
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="图片适配">
                          <select className="admin-select" value={selectedLayer.fit} onChange={(event) => updateLayer(selectedLayer.id, { fit: event.target.value as 'contain' | 'cover' })}>
                            <option value="contain">完整显示</option><option value="cover">填满裁切</option>
                          </select>
                        </Field>
                        <Field label={`不透明度 ${Math.round(selectedLayer.opacity * 100)}%`}>
                          <input className="mt-2 w-full accent-accent" type="range" min={0} max={1} step={0.05} value={selectedLayer.opacity} onChange={(event) => updateLayer(selectedLayer.id, { opacity: Number(event.target.value) })} />
                        </Field>
                      </div>
                    </>
                  )}
                  <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
                    <Field label="左边距（px）"><input className="input" type="number" min={0} max={360} value={selectedLayer.x} onChange={(event) => changePosition('x', event.target.value)} /></Field>
                    <Field label="上边距（px）"><input className="input" type="number" min={0} max={640} value={selectedLayer.y} onChange={(event) => changePosition('y', event.target.value)} /></Field>
                    <Field label="宽度（px）"><input className="input" type="number" min={selectedLayer.type === 'qrcode' ? 64 : selectedLayer.type === 'text' ? 20 : 12} max={360} value={selectedLayer.width} onChange={(event) => changePosition('width', event.target.value)} /></Field>
                    <Field label="高度（px）"><input className="input" type="number" min={selectedLayer.type === 'qrcode' ? 64 : 12} max={640} value={selectedLayer.height} onChange={(event) => changePosition('height', event.target.value)} /></Field>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="画布背景" description="支持纯色或从文件管理选择竖版背景图。" icon={<ImagePlus size={15} />} />
              <div className="space-y-3 p-3">
                <Field label="背景颜色">
                  <input className="input h-9 p-1" type="color" value={template.backgroundColor} onChange={(event) => setTemplate((current) => ({ ...current, backgroundColor: event.target.value.toUpperCase() }))} />
                </Field>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setPickerTarget({ kind: 'background' })}><ImagePlus size={14} />选择背景图</Button>
                  {template.backgroundImageUrl && <Button size="sm" variant="ghost" onClick={() => void removeBackgroundImage()}><Trash2 size={14} />移除</Button>}
                </div>
                {template.backgroundImageUrl && (
                  <div className="flex items-center gap-2 rounded-md border border-line bg-raised p-2">
                    <img src={resolveAssetUrl(template.backgroundImageUrl)} alt="背景图" className="h-12 w-9 rounded object-cover" />
                    <span className="min-w-0 flex-1 truncate text-2xs text-ink-faint">{template.backgroundImageUrl}</span>
                  </div>
                )}
                <div className="text-2xs leading-5 text-ink-faint">模板画布 360 × 640 px；H5 保存海报时输出 1080 × 1920 px。图层位置可拖拽，也可在属性面板输入数值。</div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {pickerTarget && createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-canvas p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink">{pickerTarget.kind === 'background' ? '选择邀请海报背景' : '选择品牌图片'}</h3>
              <p className="mt-1 text-xs text-ink-muted">{pickerTarget.kind === 'background' ? '素材将按 9:16 竖版裁剪为 1080 × 1920 px。' : '保持图片原比例，建议使用透明 PNG / WebP Logo。'}</p>
            </div>
            <Button variant="secondary" onClick={() => setPickerTarget(null)}>返回编辑</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-panel">
            <FileManager
              picker
              cropPreset={pickerTarget.kind === 'background' ? 'poster-background' : 'poster-image'}
              currentUrls={pickerCurrentUrls}
              onPick={acceptPickedImage}
            />
          </div>
        </div>,
        document.body,
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
      {confirmNode}
    </>
  );
}
