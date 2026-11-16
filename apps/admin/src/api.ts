const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api';

export type AdminRole = 'SUPER_ADMIN' | 'OPERATOR' | 'FINANCE' | 'SUPPORT';

const ADMIN_PATH_ROLES: Record<string, AdminRole[]> = {
  '/': ['SUPER_ADMIN', 'OPERATOR', 'FINANCE'],
  '/catalog': ['SUPER_ADMIN', 'OPERATOR'],
  '/categories': ['SUPER_ADMIN', 'OPERATOR'],
  '/files': ['SUPER_ADMIN', 'OPERATOR'],
  '/orders': ['SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT'],
  '/members': ['SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT'],
  '/bonuses': ['SUPER_ADMIN', 'OPERATOR', 'FINANCE'],
  '/ranks': ['SUPER_ADMIN'],
  '/assets': ['SUPER_ADMIN', 'OPERATOR', 'FINANCE'],
  '/settlements': ['SUPER_ADMIN', 'OPERATOR', 'FINANCE'],
  '/risk': ['SUPER_ADMIN', 'OPERATOR'],
  '/approvals': ['SUPER_ADMIN', 'OPERATOR', 'FINANCE'],
  '/features': ['SUPER_ADMIN'],
  '/reports': ['SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT'],
  '/system': ['SUPER_ADMIN'],
  '/audit': ['SUPER_ADMIN'],
};

export function getAdminRole(): AdminRole | null {
  const token = localStorage.getItem('solar_admin_token');
  if (!token) return null;
  try {
    const encoded = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!encoded) return null;
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as { role?: string };
    return ['SUPER_ADMIN', 'OPERATOR', 'FINANCE', 'SUPPORT'].includes(payload.role ?? '')
      ? payload.role as AdminRole
      : null;
  } catch {
    return null;
  }
}

export function canAccessAdminPath(path: string, role = getAdminRole()): boolean {
  return !!role && (ADMIN_PATH_ROLES[path] ?? []).includes(role);
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
      window.location.href = '/login';
    }
    throw new ApiError(json.code, json.message);
  }
  return json.data;
}

export const post = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

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
