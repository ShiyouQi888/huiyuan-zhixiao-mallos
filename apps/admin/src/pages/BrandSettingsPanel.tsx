import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeCheck, Building2, ExternalLink, ImagePlus, Save, ShieldCheck } from 'lucide-react';
import { DEFAULT_BRAND_SETTINGS, type BrandSettings } from '../../../../packages/shared/src/brand-settings';
import { api, put, resolveAssetUrl } from '../api';
import {
  Button, Card, CardHeader, Field, Toast, useConfirm,
} from '../components/ui';
import { FileManager } from './FileManager';

export function BrandSettingsPanel() {
  const [settings, setSettings] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const [savedSettings, setSavedSettings] = useState<BrandSettings>(DEFAULT_BRAND_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');
  const { confirm, confirmNode } = useConfirm();

  const changed = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [settings, savedSettings],
  );

  useEffect(() => {
    let active = true;
    api<BrandSettings>('/admin/brand')
      .then((result) => {
        if (!active) return;
        const next = { ...DEFAULT_BRAND_SETTINGS, ...result };
        setSettings(next);
        setSavedSettings(next);
      })
      .catch((error: Error) => {
        if (active) {
          setToastTone('error');
          setToast(error.message || '品牌设置加载失败');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const update = <K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!settings.brandName.trim() || !settings.storeName.trim()) {
      setToastTone('error');
      setToast('品牌名称和商城名称不能为空');
      return;
    }
    const agreed = await confirm({
      title: '确认保存品牌设置？',
      description: `「${settings.brandName}」及备案信息将同步到会员 H5 与合伙人 H5，并立即生效。`,
      confirmText: '保存品牌设置',
      tone: 'danger',
      confirmationText: `保存品牌设置 ${settings.brandName}`,
    });
    if (!agreed) return;
    setSaving(true);
    try {
      const result = await put<BrandSettings>('/admin/brand', settings);
      const next = { ...DEFAULT_BRAND_SETTINGS, ...result };
      setSettings(next);
      setSavedSettings(next);
      window.dispatchEvent(new CustomEvent<BrandSettings>('solar:brand-updated', { detail: next }));
      setToastTone('success');
      setToast('品牌与备案设置已保存，前台将在下次加载时同步');
    } catch (error) {
      setToastTone('error');
      setToast(error instanceof Error ? error.message : '保存品牌设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">品牌与备案</h2>
          <p className="mt-1 text-xs leading-5 text-ink-muted">统一管理会员 H5 与合伙人 H5 使用的品牌展示和双备案信息。</p>
        </div>
        <Button variant="primary" disabled={loading || saving || !changed} onClick={() => void save()}>
          <Save size={14} />{saving ? '保存中…' : '保存设置'}
        </Button>
      </div>

      {loading ? (
        <Card className="p-6"><div className="skeleton h-48 w-full" /></Card>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader title="品牌识别" description="用于商城、登录页和浏览器页面标题。" icon={<Building2 size={15} />} />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="品牌名称" required hint="前台品牌主名称，最多 40 个字符。">
                  <input className="input" maxLength={40} value={settings.brandName} onChange={(event) => update('brandName', event.target.value)} />
                </Field>
                <Field label="商城名称" required hint="用于会员商城与服务入口的辅助标识。">
                  <input className="input" maxLength={40} value={settings.storeName} onChange={(event) => update('storeName', event.target.value)} />
                </Field>
                <Field label="品牌宣传语" className="sm:col-span-2" hint="显示在品牌介绍区域，最多 100 个字符。">
                  <input className="input" maxLength={100} value={settings.tagline} onChange={(event) => update('tagline', event.target.value)} />
                </Field>
                <Field label="页脚服务说明" className="sm:col-span-2" hint="显示在会员端与合伙人端页面底部。">
                  <input className="input" maxLength={120} value={settings.footerText} onChange={(event) => update('footerText', event.target.value)} />
                </Field>
                <Field label="品牌 Logo" className="sm:col-span-2" hint="建议先在文件管理上传透明 PNG / WebP，再从素材库选择。">
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel p-3">
                    <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-line bg-raised">
                      {settings.logoUrl ? <img className="h-full w-full object-contain p-1" src={resolveAssetUrl(settings.logoUrl)} alt="品牌 Logo 预览" /> : <Building2 size={23} className="text-ink-faint" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-ink">{settings.logoUrl ? '已选择品牌图片' : '使用系统默认品牌图标'}</div>
                      <div className="mt-1 truncate text-2xs text-ink-faint">{settings.logoUrl || '尚未选择图片素材'}</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}><ImagePlus size={14} />选择素材</Button>
                    {settings.logoUrl && <Button size="sm" variant="ghost" onClick={() => update('logoUrl', '')}>移除</Button>}
                  </div>
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader title="网站备案信息" description="分别维护工信部 ICP 备案与公安机关联网备案号。" icon={<ShieldCheck size={15} />} />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="ICP备案号" hint="例如：京ICP备12345678号。留空时前台不显示。">
                  <input className="input" maxLength={80} value={settings.icpFilingNumber} onChange={(event) => update('icpFilingNumber', event.target.value)} placeholder="请输入工信部备案号" />
                </Field>
                <Field label="ICP备案查询链接" hint="点击前台 ICP 备案号时打开此地址；支持 HTTP(S)。">
                  <input className="input" type="url" maxLength={500} value={settings.icpFilingUrl} onChange={(event) => update('icpFilingUrl', event.target.value)} placeholder="https://beian.miit.gov.cn/" />
                </Field>
                <Field label="公安备案号" hint="例如：京公网安备 11000000000000 号。">
                  <input className="input" maxLength={100} value={settings.publicSecurityFilingNumber} onChange={(event) => update('publicSecurityFilingNumber', event.target.value)} placeholder="请输入公安机关备案号" />
                </Field>
                <Field label="公安备案查询链接（选填）" className="sm:col-span-2" hint="留空时链接到公安备案平台官网；只允许 HTTP(S) 地址。">
                  <input className="input" type="url" maxLength={500} value={settings.publicSecurityFilingUrl} onChange={(event) => update('publicSecurityFilingUrl', event.target.value)} placeholder="https://www.beian.gov.cn/…" />
                </Field>
                <div className="notice notice-info sm:col-span-2">
                  <BadgeCheck size={15} />备案号码按原文展示；未填写的号码会在前台隐藏。填写前请核对备案主体与域名信息。
                </div>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="H5 品牌预览" description="前台将按设备宽度自动适配。" icon={<ExternalLink size={15} />} />
            <div className="p-4">
              <div className="mx-auto max-w-[360px] overflow-hidden rounded-[20px] border border-line bg-canvas shadow-card">
                <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-accent-soft text-accent-ink">
                    {settings.logoUrl ? <img className="h-full w-full object-contain p-1" src={resolveAssetUrl(settings.logoUrl)} alt="" /> : <Building2 size={20} />}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">{settings.brandName || '品牌名称'}</div>
                    <div className="truncate text-xs text-ink-muted">{settings.storeName || '商城名称'}</div>
                  </div>
                </div>
                <div className="px-4 py-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-accent-ink">{settings.storeName || '会员商城'}</div>
                  <div className="mt-2 text-base font-semibold text-ink">{settings.brandName || '品牌名称'}</div>
                  <p className="mt-1 min-h-10 text-xs leading-5 text-ink-muted">{settings.tagline || '品牌宣传语将在此显示'}</p>
                </div>
                <div className="border-t border-line bg-panel px-4 py-3 text-center">
                  <p className="text-[10px] leading-4 text-ink-muted">{settings.footerText || '服务说明'}</p>
                  <div className="mt-2 flex flex-col items-center gap-1">
                    {settings.icpFilingNumber && <a className="text-[10px] text-ink-faint" href={settings.icpFilingUrl || 'https://beian.miit.gov.cn/'} target="_blank" rel="noreferrer">{settings.icpFilingNumber}</a>}
                    {settings.publicSecurityFilingNumber && <a className="text-[10px] text-ink-faint" href={settings.publicSecurityFilingUrl || 'https://www.beian.gov.cn/'} target="_blank" rel="noreferrer">{settings.publicSecurityFilingNumber}</a>}
                    {!settings.icpFilingNumber && !settings.publicSecurityFilingNumber && <span className="text-[10px] text-ink-faint">备案信息填写后将在此前台展示</span>}
                  </div>
                </div>
              </div>
              <div className="notice notice-info mt-4">品牌变更会在 H5 下次访问时读取；备案号码将作为官网备案查询链接显示。</div>
            </div>
          </Card>
        </div>
      )}

      {pickerOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex flex-col bg-canvas p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink">选择品牌 Logo</h3>
              <p className="mt-1 text-xs text-ink-muted">从文件素材库选择图片，也可直接上传透明 PNG / WebP 图片。</p>
            </div>
            <Button variant="secondary" onClick={() => setPickerOpen(false)}>返回品牌设置</Button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-panel">
            <FileManager picker cropPreset="poster-image" currentUrls={settings.logoUrl ? [settings.logoUrl] : []}
              onPick={(urls) => { update('logoUrl', urls.at(-1) ?? ''); setPickerOpen(false); }} />
          </div>
        </div>,
        document.body,
      )}
      {toast && <Toast message={toast} tone={toastTone} onClose={() => setToast('')} />}
      {confirmNode}
    </>
  );
}
