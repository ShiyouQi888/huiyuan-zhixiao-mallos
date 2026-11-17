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

async function idempotencyHeader(path: string, bodyText: string, token: string | null): Promise<{ key: string; storageKey: string }> {
  let fingerprint = '';
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token ?? ''}:${bodyText}`));
    fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    const scoped = `${token ?? ''}:${bodyText}`;
    fingerprint = `${scoped.length}-${scoped.split('').reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0)}`;
  }
  const storageKey = `solar_idem:${path}:${fingerprint}`;
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return { key: existing, storageKey };
  } catch {
    /* session storage may be disabled; the request still gets a unique key */
  }
  const key = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem(storageKey, key); } catch { /* continue without retry persistence */ }
  return { key, storageKey };
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = localStorage.getItem('solar_member_token');
  const method = (options.method ?? 'GET').toUpperCase();
  const bodyText = options.body === undefined ? '' : JSON.stringify(options.body);
  const needsIdempotency = method === 'POST' && (
    path === '/orders' || /^\/me\/(?:wallet|token|equity)\/transfers$/.test(path)
  );
  const idempotency = needsIdempotency ? await idempotencyHeader(path, bodyText, token) : null;
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(idempotency ? { 'X-Idempotency-Key': idempotency.key } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body === undefined ? undefined : bodyText,
  });
  const json = (await res.json()) as Envelope<T>;
  if (json.code !== 0) {
    if (json.code === 2001 || json.code === 2003) {
      localStorage.removeItem('solar_member_token');
      location.hash = '#/login';
    }
    throw new Error(json.message);
  }
  if (idempotency) {
    try { sessionStorage.removeItem(idempotency.storageKey); } catch { /* ignore */ }
  }
  return json.data;
}

export const post = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body });

export function money(value: unknown): string {
  return Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
