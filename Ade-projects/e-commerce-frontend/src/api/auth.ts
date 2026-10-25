import { api, tokenStore } from './client';
import type { User } from '../types';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignupPayload {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  phoneNumber?: string;
  address?: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

export async function login(payload: LoginPayload) {
  const { data } = await api.post<AuthResponse>('/auth/login', payload);
  tokenStore.set(data.accessToken, data.refreshToken);
  return data.user;
}

export async function signup(payload: SignupPayload) {
  const { data } = await api.post('/auth/signup', payload);
  return data as { message: string; customer: User };
}

export async function fetchMe() {
  const { data } = await api.get<User>('/auth/me');
  return data;
}

export async function logout() {
  try {
    await api.post('/auth/logout');
  } finally {
    tokenStore.clear();
  }
}

export async function forgotPassword(email: string) {
  const { data } = await api.post('/auth/forgot-password', { email });
  return data;
}

export async function resetPassword(userId: string, token: string, newPassword: string, confirmPassword: string) {
  const { data } = await api.post(`/auth/reset-password/${userId}/${token}`, {
    newPassword,
    confirmPassword,
  });
  return data;
}

export async function verifyEmail(userId: string, token: string) {
  const { data } = await api.get(`/auth/email-verify/${userId}/${token}`);
  return data;
}
