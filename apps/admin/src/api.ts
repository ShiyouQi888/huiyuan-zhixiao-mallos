import {
  ADMIN_PATH_PERMISSION,
  ADMIN_ROLE_PERMISSION_CODES,
  isAdminRole,
  type AdminRole,
} from '../../../packages/shared/src/admin-permissions';

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api';

export type { AdminRole } from '../../../packages/shared/src/admin-permissions';

export interface AdminAccessSnapshot {
  role: AdminRole;
  roleLabel: string;
  permissionCodes: string[];
  permissionsCustomized: boolean;
}

const ADMIN_ACCESS_KEY = 'solar_admin_access';

export function getAdminAccessSnapshot(): AdminAccessSnapshot | null {
  const token = localStorage.getItem('solar_admin_token');
  if (!token) return null;
  try {
    const cached = JSON.parse(localStorage.getItem(ADMIN_ACCESS_KEY) ?? 'null');
    if (cached?.token === token && isAdminRole(cached.role) && Array.isArray(cached.permissionCodes)) {
      return {
        role: cached.role,
        roleLabel: typeof cached.roleLabel === 'string' ? cached.roleLabel : cached.role,
        permissionCodes: cached.permissionCodes,
        permissionsCustomized: Boolean(cached.permissionsCustomized),
      };
    }
  } catch {
    localStorage.removeItem(ADMIN_ACCESS_KEY);
  }
  return null;
}

export function setAdminAccessSnapshot(access: AdminAccessSnapshot): void {
  const token = localStorage.getItem('solar_admin_token');
  if (token) localStorage.setItem(ADMIN_ACCESS_KEY, JSON.stringify({ ...access, token }));
}

export function clearAdminAccessSnapshot(): void {
  localStorage.removeItem(ADMIN_ACCESS_KEY);
}

export function getAdminRole(): AdminRole | null {
  const cached = getAdminAccessSnapshot();
  if (cached) return cached.role;
  const token = localStorage.getItem('solar_admin_token');
  if (!token) return null;
  try {
    const encoded = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!encoded) return null;
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as { role?: string };
    const role = payload.role;
    return typeof role === 'string' && isAdminRole(role) ? role : null;
  } catch {
    return null;
  }
}

export function canAccessAdminPath(
  path: string,
  role = getAdminRole(),
  permissionCodes: readonly string[] | null = getAdminAccessSnapshot()?.permissionCodes ?? null,
): boolean {
  if (!role || !isAdminRole(role)) return false;
  const permission = ADMIN_PATH_PERMISSION[path];
  if (!permission || !ADMIN_ROLE_PERMISSION_CODES[role].includes(permission)) return false;
  return role === 'SUPER_ADMIN' || !permissionCodes || permissionCodes.includes(permission);
}

export function firstAccessibleAdminPath(role: AdminRole, permissionCodes: readonly string[] | null): string | undefined {
  const paths = Object.keys(ADMIN_PATH_PERMISSION);
  return paths.find((path) => canAccessAdminPath(path, role, permissionCodes));
}

/** Resolve API-stored paths such as /uploads/... against the API host. */
export function resolveAssetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^(?:https?:|data:|blob:)/i.test(path)) return path;
  try {
    return new URL(path, new URL(BASE, window.location.origin)).toString();
  } catch {
    return path;
  }
}

interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  traceId: string;
}

export class ApiError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('solar_admin_token');
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  if (json.code !== 0) {
    if (json.code === 2001 || json.code === 2003) {
      localStorage.removeItem('solar_admin_token');
      clearAdminAccessSnapshot();
      window.location.href = '/login';
    }
    throw new ApiError(json.code, json.message);
  }
  return json.data;
}

async function financialIdempotency(path: string, bodyText: string, token: string | null) {
  const financialMutation = /^\/admin\/(?:members\/\d+\/(?:wallet\/(?:recharge|adjust|clear-available)|transfer-quota\/(?:grant|adjust|clear-available))|wallets\/\d+\/adjust|equity\/\d+\/adjust)$/.test(path);
  if (!financialMutation) return undefined;
  const scoped = `${token ?? ''}:${bodyText}`;
  let fingerprint: string;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scoped));
    fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    fingerprint = `${scoped.length}-${scoped.split('').reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0)}`;
  }
  const storageKey = `solar_admin_idem:${path}:${fingerprint}`;
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) return { key: saved, storageKey };
  } catch { /* browser storage can be disabled */ }
  const key = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { sessionStorage.setItem(storageKey, key); } catch { /* send once without retry persistence */ }
  return { key, storageKey };
}

export const post = async <T = any>(path: string, body?: unknown) => {
  const bodyText = body === undefined ? '' : JSON.stringify(body);
  const token = localStorage.getItem('solar_admin_token');
  const idempotency = await financialIdempotency(path, bodyText, token);
  const result = await api<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : bodyText,
    headers: idempotency ? { 'X-Idempotency-Key': idempotency.key } : undefined,
  });
  if (idempotency) {
    try { sessionStorage.removeItem(idempotency.storageKey); } catch { /* ignore */ }
  }
  return result;
};

export const put = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });

export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });
export const patch = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });

export function fmtMoney(value: unknown): string {
  const n = Number(value ?? 0);
  return `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

export function fmtDate(value: unknown): string {
  if (!value) return '—';
  return new Date(value as string).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}
