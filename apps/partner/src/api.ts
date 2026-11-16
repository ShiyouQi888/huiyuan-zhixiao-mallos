const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000/api';

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = localStorage.getItem('solar_member_token');
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = (await res.json()) as { code: number; message: string; data: T };
  if (json.code !== 0) {
    if (json.code === 2001 || json.code === 2002) {
      localStorage.removeItem('solar_member_token');
      location.hash = '#/login';
    }
    throw new Error(json.message);
  }
  return json.data;
}

export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body });

export function money(value: unknown): string {
  return Number(value ?? 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
