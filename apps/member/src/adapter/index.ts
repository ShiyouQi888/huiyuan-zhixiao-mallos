/** H5 已上线，APP 仅保留原生桥接的规划接口。 */
export type Platform = 'h5' | 'app';

const configuredPlatform = import.meta.env.VITE_PLATFORM as string | undefined;
export const platform: Platform = configuredPlatform === 'app' ? 'app' : 'h5';

/** 统一登录：H5 使用账号密码，APP 后续接入原生认证桥。 */
export async function login(phone: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message);
  return json.data;
}

export async function registerMember(input: {
  nickname: string;
  phone: string;
  password: string;
  inviteCode?: string;
}): Promise<{ token: string }> {
  const res = await fetch(`${apiBase()}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message);
  return json.data;
}

/** 统一支付参数获取（现金部分为线下登记，APP 原生支付后续接入） */
export async function requestPayment(_orderNo: string): Promise<void> {
  // H5 与 APP 支付能力按平台接入计划分别实现。
}

/** 统一图片上传 */
export async function chooseImage(): Promise<File | null> {
  if (platform !== 'h5') return null;
  return null;
}

/** 统一消息订阅（当前端未接入订阅消息能力） */
export async function subscribeMessage(): Promise<boolean> {
  return false;
}

/** 统一分享：H5 复制链接，APP 后续接入原生分享 */
export async function share(title: string, url: string): Promise<void> {
  if (platform === 'h5') {
    await navigator.clipboard?.writeText(`${title} ${url}`);
    return;
  }
  // APP 原生分享桥接后续接入。
}

/** 统一扫码 */
export async function scanCode(): Promise<string | null> {
  if (platform !== 'h5') return null;
  return null;
}

export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api';
}
