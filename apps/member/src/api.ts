import { apiBase } from './adapter';

export function resolveAssetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  try {
    return new URL(path, new URL(apiBase(), window.location.origin)).toString();
  } catch {
    return path;
  }
}

interface Envelope<T> { code: number; message: string; data: T; traceId: string }

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = localStorage.getItem('solar_member_token');
  const res = await fetch(`${apiBase()}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = (await res.json()) as Envelope<T>;
  if (json.code !== 0) {
    if (json.code === 2001 || json.code === 2003) {
      localStorage.removeItem('solar_member_token');
      location.hash = '#/login';
    }
    throw new Error(json.message);
  }
  return json.data;
}

export const post = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body });

export function money(value: unknown): string {
  return Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
