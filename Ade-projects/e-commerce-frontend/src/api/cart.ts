import { api } from './client';
import type { Cart } from '../types';

export async function getCart() {
  const { data } = await api.get<Cart>('/cart');
  return data;
}

export async function addCartItem(variantId: string, quantity: number) {
  const { data } = await api.post<Cart>('/cart/items', { variantId, quantity });
  return data;
}

export async function removeCartItem(variantId: string) {
  const { data } = await api.delete<Cart>(`/cart/items/${variantId}`);
  return data;
}

export async function clearCart() {
  const { data } = await api.delete<Cart>('/cart');
  return data;
}
