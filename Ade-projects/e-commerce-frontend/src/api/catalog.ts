import { api } from './client';
import type { Brand, Category, Paginated, Product, Variant } from '../types';

export interface ProductQuery {
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  featured?: boolean;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'price' | 'name';
  sortOrder?: 'asc' | 'desc';
}

export const listProducts = (q: ProductQuery = {}) => api.get<Paginated<Product>>('/products', q);
export const getProduct = (id: string) => api.get<Product>(`/products/${id}`);
export const createProduct = (form: FormData) => api.post<Product>('/products', form);
export const updateProduct = (id: string, body: Partial<Pick<Product, 'name' | 'description' | 'price' | 'sku' | 'featured' | 'isActive'>> & { category?: string; brand?: string; dealDays?: number; dealHours?: number }) =>
  api.put<Product>(`/products/${id}`, body);
export const addProductImages = (id: string, form: FormData) => api.post<Product>(`/products/${id}/images`, form);
export const removeProductImage = (id: string, url: string) => api.delete<Product>(`/products/${id}/images`, { url });
export const deleteProduct = (id: string) => api.delete(`/products/${id}`);

export const listVariants = (productId: string) => api.get<Variant[]>(`/variants/product/${productId}`);
export const createVariant = (form: FormData) => api.post<Variant>('/variants', form);
export const updateStock = (id: string, stock: number) => api.patch<Variant>(`/variants/${id}/stock`, { stock });
export const deleteVariant = (id: string) => api.delete(`/variants/${id}`);

export const listBrands = () => api.get<Brand[] | Paginated<Brand>>('/brands').then(unwrap);
export const createBrand = (name: string, description?: string) => api.post<Brand>('/brands', { name, description });
export const deleteBrand = (id: string) => api.delete(`/brands/${id}`);
export const listCategories = () => api.get<Category[] | Paginated<Category>>('/categories').then(unwrap);
export const createCategory = (name: string, description?: string) => api.post<Category>('/categories', { name, description });
export const deleteCategory = (id: string) => api.delete(`/categories/${id}`);

function unwrap<T>(r: T[] | Paginated<T>): T[] {
  return Array.isArray(r) ? r : r.data;
}
