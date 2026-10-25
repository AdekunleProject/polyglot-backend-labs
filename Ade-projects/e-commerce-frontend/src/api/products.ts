import { api } from './client';
import type { Paginated, Product } from '../types';

export interface ProductQuery {
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function listProducts(query: ProductQuery = {}) {
  const { data } = await api.get<Paginated<Product>>('/products', { params: query });
  return data;
}

export async function getProduct(productId: string) {
  const { data } = await api.get<Product>(`/products/${productId}`);
  return data;
}

export async function createProduct(formData: FormData) {
  const { data } = await api.post<Product>('/products', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function updateProduct(productId: string, payload: Partial<Product>) {
  const { data } = await api.put<Product>(`/products/${productId}`, payload);
  return data;
}

export async function deleteProduct(productId: string) {
  const { data } = await api.delete(`/products/${productId}`);
  return data;
}
