import { api } from './client';
import type { Category } from '../types';

// The backend's categories module is real and fully functional
// (GET/POST/PUT/DELETE /categories) — this frontend just never had a
// client for it. AdminCategories.tsx currently derives categories
// client-side from sampled products instead of using this; that's a
// separate, larger change (swapping a working read-only view for real
// CRUD) worth doing deliberately rather than as a side effect of fixing
// product creation.
export async function listCategories() {
  const { data } = await api.get<Category[]>('/categories');
  return data;
}
