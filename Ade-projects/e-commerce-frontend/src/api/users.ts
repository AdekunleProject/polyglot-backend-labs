import { api } from './client';
import type { User } from '../types';

export interface CustomerProfile {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  emergencyContact?: string;
  department?: string;
  email: string;
  phoneNumber?: string;
  profileImage?: string;
}

export async function getProfile() {
  const { data } = await api.get<CustomerProfile>('/users/profile');
  return data;
}

export interface UpdateCustomerProfilePayload {
  firstname?: string;
  lastname?: string;
  phoneNumber?: string;
  address?: string;
  dateOfBirth?: string;
  gender?: string;
}

export async function updateCustomerProfile(payload: UpdateCustomerProfilePayload, image?: File | null) {
  const fd = new FormData();
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined && value !== '') fd.append(key, value);
  });
  if (image) fd.append('image', image);
  const { data } = await api.patch<{ message: string; user: User }>('/users/update-customer-profile', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deactivateUser(userId: string) {
  const { data } = await api.patch(`/users/${userId}/deactivate`);
  return data;
}

// Admin only
export async function listUsers() {
  const { data } = await api.get<User[]>('/users');
  return data;
}
