import { api, tokenStore } from './client';
import type { Profile, User } from '../types';

export interface SignupPayload {
  firstname: string;
  middlename?: string;
  lastname: string;
  email: string;
  password: string;
  phoneNumber: string;
  address: string;
  dateOfBirth: string;
  gender: string;
}

export interface Session { accessToken: string; refreshToken: string; user: User }
export interface TwoFactorChallenge { twoFactorRequired: true; challengeToken: string; message: string }

export const isChallenge = (r: Session | TwoFactorChallenge): r is TwoFactorChallenge => 'twoFactorRequired' in r;

export async function login(email: string, password: string): Promise<Session | TwoFactorChallenge> {
  const data = await api.post<Session | TwoFactorChallenge>('/auth/login', { email, password });
  if (!isChallenge(data)) tokenStore.set(data.accessToken, data.refreshToken);
  return data;
}

export async function loginWithTwoFactor(email: string, challengeToken: string, code: string) {
  const data = await api.post<Session>('/auth/2fa/login', { email, challengeToken, code });
  tokenStore.set(data.accessToken, data.refreshToken);
  return data;
}

export const signup = (payload: SignupPayload) =>
  api.post<{ message: string; customer: Profile }>('/auth/signup', payload);

export const fetchMe = () => api.get<User>('/auth/me');
export const fetchProfile = () => api.get<Profile>('/users/profile');

export async function logout() {
  const refreshToken = tokenStore.getRefresh();
  try {
    await api.post('/auth/logout', refreshToken ? { refreshToken } : {});
  } finally {
    tokenStore.clear();
  }
}

export const verifyEmail = (email: string, code: string) => api.post<{ message: string }>('/auth/verify-email', { email, code });
export const resendVerification = (email: string) => api.post<{ message: string }>('/auth/resend-verification', { email });
export const forgotPassword = (email: string) => api.post<{ message: string }>('/auth/forgot-password', { email });
export const verifyResetCode = (email: string, code: string) => api.post<{ message: string }>('/auth/verify-password', { email, code });
export const resetPassword = (newPassword: string, confirmPassword: string) =>
  api.post<{ message: string }>('/auth/reset-password', { newPassword, confirmPassword });

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post<{ message?: string }>('/users/me/change-password', { currentPassword, newPassword });

export const twoFactorSetup = () => api.post<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup');
export const twoFactorEnable = (code: string) => api.post<{ message?: string; recoveryCodes?: string[] }>('/auth/2fa/enable', { code });
export const twoFactorDisable = (code: string, password?: string) => api.post('/auth/2fa/disable', { code, password });

export function updateProfile(fields: Record<string, string | undefined>) {
  return api.patch<Profile>('/users/update-customer-profile', fields);
}
