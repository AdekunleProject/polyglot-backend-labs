import { demoRequest, DEMO } from '../demo/server';
import { HttpError } from './http-error';

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000';

const ACCESS = 'hsa_access_token';
const REFRESH = 'hsa_refresh_token';

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

export const tokenStore = {
  getAccess: () => store.get(ACCESS),
  getRefresh: () => store.get(REFRESH),
  set: (access: string, refresh?: string) => {
    store.set(ACCESS, access);
    if (refresh) store.set(REFRESH, refresh);
  },
  clear: () => { store.del(ACCESS); store.del(REFRESH); },
};

export { HttpError };

export interface RequestOptions {
  params?: object;
  body?: unknown;
  auth?: boolean;
  as?: 'json' | 'text';
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function queryString(params?: object): string {
  if (!params) return '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function send<T>(method: Method, path: string, opts: RequestOptions, token: string | null): Promise<T> {
  if (DEMO) return demoRequest<T>(method, path, opts, token);

  const headers: Record<string, string> = {};
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    // credentials: include keeps the short-lived password-reset cookie the API sets on /auth.
    res = await fetch(`${API_URL}${path}${queryString(opts.params)}`, { method, headers, body, credentials: 'include' });
  } catch {
    throw new HttpError(0, null, 'Cannot reach the server. Check your connection and try again.');
  }

  const raw = await res.text();
  let data: unknown = raw;
  if (opts.as !== 'text') {
    try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  }
  if (!res.ok) {
    const m = (data as { message?: string | string[] } | null)?.message;
    throw new HttpError(res.status, data, Array.isArray(m) ? m.join(' ') : m || res.statusText);
  }
  return data as T;
}

let refreshing: Promise<string | null> | null = null;

async function refreshTokens(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  try {
    const data = await send<{ accessToken: string; refreshToken: string }>('POST', '/auth/refresh', { body: { refreshToken }, auth: false }, null);
    tokenStore.set(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await send<T>(method, path, opts, tokenStore.getAccess());
  } catch (error) {
    const authRoute = path.startsWith('/auth/') && !path.startsWith('/auth/me');
    if (!(error instanceof HttpError) || error.status !== 401 || authRoute || opts.auth === false || !tokenStore.getRefresh()) throw error;
    // Refresh tokens rotate, so only one refresh may run at a time.
    refreshing ??= refreshTokens().finally(() => { refreshing = null; });
    const token = await refreshing;
    if (!token) {
      tokenStore.clear();
      window.dispatchEvent(new Event('hsa:signed-out'));
      throw error;
    }
    return send<T>(method, path, opts, token);
  }
}

export const api = {
  get: <T>(path: string, params?: object, as?: 'json' | 'text') => request<T>('GET', path, { params, as }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
};

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof HttpError) {
    if (error.status === 0) return error.message;
    if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    if (error.status === 403 && !error.message) return 'You do not have permission to do that.';
    return error.message || fallback;
  }
  return fallback;
}

export const statusOf = (error: unknown): number | undefined => (error instanceof HttpError ? error.status : undefined);
