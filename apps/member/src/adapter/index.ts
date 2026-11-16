/**
 * 端适配层：业务代码禁止直接调用 wx.* / my.* 等平台 API。
 * 所有端差异在此收敛，业务层只依赖本文件导出的统一方法。
 *
 * 多端编译时只需替换本文件的实现（H5 / MP-WEIXIN / MP-ALIPAY / APP），
 * 业务页面无需改动。
 */

export type Platform = 'h5' | 'weixin' | 'alipay' | 'app';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('micromessenger')) return 'weixin';
  if (ua.includes('alipay')) return 'alipay';
  return 'h5';
}

export const platform: Platform = detectPlatform();

/** 统一登录：H5 走手机号密码，小程序走 wx.login */
export async function login(phone: string, password: string): Promise<{ token: string }> {
  if (platform === 'weixin') {
    // #ifdef MP-WEIXIN
    // const { code } = await wx.login(); → POST /api/auth/wechat { code }
    // #endif
  }
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message);
  return json.data;
}

/** 统一支付参数获取（本系统现金部分为线下登记，保留适配点） */
export async function requestPayment(_orderNo: string): Promise<void> {
  // H5: 跳转支付页 / 小程序: wx.requestPayment / App: 原生 SDK
}

/** 统一图片上传 */
export async function chooseImage(): Promise<File | null> {
  if (platform !== 'h5') {
    // #ifdef MP-WEIXIN
    // const res = await wx.chooseMedia({ count: 1 }); return res.tempFiles[0];
    // #endif
    return null;
  }
  return null;
}

/** 统一消息订阅 */
export async function subscribeMessage(): Promise<boolean> {
  if (platform === 'weixin') {
    // #ifdef MP-WEIXIN
    // return await wx.requestSubscribeMessage({ tmplIds: [...] });
    // #endif
  }
  return false;
}

/** 统一分享：H5 复制链接，小程序 onShareAppMessage */
export async function share(title: string, url: string): Promise<void> {
  if (platform === 'h5') {
    await navigator.clipboard?.writeText(`${title} ${url}`);
    return;
  }
  // 小程序由页面 onShareAppMessage 处理
}

/** 统一扫码 */
export async function scanCode(): Promise<string | null> {
  if (platform !== 'h5') {
    // #ifdef MP-WEIXIN
    // const res = await wx.scanCode(); return res.result;
    // #endif
    return null;
  }
  return null;
}

export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api';
}
