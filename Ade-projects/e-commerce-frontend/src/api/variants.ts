import { api } from './client';
import type { ProductVariant } from '../types';

export async function listVariantsForProduct(productId: string) {
  const { data } = await api.get<ProductVariant[]>(`/variants/product/${productId}`);
  return data;
}

export async function getVariant(variantId: string) {
  const { data } = await api.get<ProductVariant>(`/variants/${variantId}`);
  return data;
}

export async function updateVariantStock(variantId: string, stock: number) {
  const { data } = await api.patch<ProductVariant>(`/variants/${variantId}/stock`, { stock });
  return data;
}

// Admin only
export async function createVariant(formData: FormData) {
  const { data } = await api.post<ProductVariant>('/variants', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteVariant(variantId: string) {
  const { data } = await api.delete(`/variants/${variantId}`);
  return data;
}
