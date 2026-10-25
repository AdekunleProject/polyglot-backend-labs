import { api } from './client';
import type { Order, ShippingAddress } from '../types';

export async function createOrder(shippingAddress: ShippingAddress) {
  const { data } = await api.post<Order>('/orders', { shippingAddress });
  return data;
}

export async function getMyOrders() {
  const { data } = await api.get<Order[]>('/orders/my-orders');
  return data;
}

export async function getMyOrder(orderId: string) {
  const { data } = await api.get<Order>(`/orders/my-orders/${orderId}`);
  return data;
}

// Admin only
export async function getAllOrders() {
  const { data } = await api.get<Order[]>('/orders');
  return data;
}

export async function getOrder(orderId: string) {
  const { data } = await api.get<Order>(`/orders/${orderId}`);
  return data;
}

export async function updateOrder(orderId: string, update: { status?: string; paymentStatus?: string }) {
  const { data } = await api.put<Order>(`/orders/${orderId}`, update);
  return data;
}
