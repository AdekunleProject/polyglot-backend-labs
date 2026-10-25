import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Base URL of the NestJS backend. Set VITE_API_URL in your .env file.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const ACCESS_TOKEN_KEY = 'manifest_access_token';
const REFRESH_TOKEN_KEY = 'manifest_refresh_token';

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  set: (access: string, refresh?: string) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccess();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Queue of requests waiting on a token refresh so we don't fire /auth/refresh
// once per failed request.
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
    const accessToken = data.accessToken ?? data.access_token;
    if (accessToken) {
      tokenStore.set(accessToken, data.refreshToken ?? data.refresh_token);
      return accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      tokenStore.clear();
    }
    return Promise.reject(error);
  }
);

// Normalizes NestJS's HttpExceptionFilter error shape into a readable string.
export function extractErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data!.message!.join(' ');
    if (typeof data?.message === 'string') return data.message;
  }
  return fallback;
}
