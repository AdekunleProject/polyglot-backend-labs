import { api } from './client';
import type { Brand } from '../types';

export async function listBrands() {
  const { data } = await api.get<Brand[]>('/brands');
  return data;
}

export async function getBrand(brandId: string) {
  const { data } = await api.get<Brand>(`/brands/${brandId}`);
  return data;
}

// Admin only
export async function createBrand(name: string, logo?: File | null) {
  const fd = new FormData();
  fd.append('name', name);
  if (logo) fd.append('logo', logo);
  const { data } = await api.post<Brand>('/brands', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteBrand(brandId: string) {
  const { data } = await api.delete(`/brands/${brandId}`);
  return data;
}
