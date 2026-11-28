import { api, HttpError } from './client';
import type { AppNotification, Cart, Order, Page, Payment, Refund, ShippingAddress } from '../types';

export const getCart = () => api.get<Cart>('/cart');
export const addCartItem = (variantId: string, quantity: number) => api.post<Cart>('/cart/items', { variantId, quantity });
export const removeCartItem = (variantId: string) => api.delete<Cart>(`/cart/items/${variantId}`);
export const clearCart = () => api.delete<Cart>('/cart');

export const createOrder = (shippingAddress: ShippingAddress) => api.post<Order>('/orders', { shippingAddress });
export const getMyOrder = (id: string) => api.get<Order>(`/orders/my-orders/${id}`);
export const getOrder = (id: string) => api.get<Order>(`/orders/${id}`);
export const updateOrderStatus = (id: string, status: string) => api.put<Order>(`/orders/${id}`, { status });

/** The API answers 404 when a customer has no orders yet. */
async function emptyOn404<T>(p: Promise<T[]>): Promise<T[]> {
  try { return await p; } catch (e) {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }
}
export const getMyOrders = () => emptyOn404(api.get<Order[]>('/orders/my-orders'));
export const getAllOrders = () => emptyOn404(api.get<Order[]>('/orders'));

export const initializePayment = (orderId: string, callbackUrl?: string) =>
  api.post<{ authorizationUrl: string; accessCode?: string; reference: string }>('/payments/initialize', { orderId, callbackUrl });
export const initializeBankTransfer = (orderId: string) =>
  api.post<{ paymentId: string; reference: string; amount: number; bankName: string; accountName: string; accountNumber: string }>(
    '/payments/bank-transfer', { orderId });
export const confirmBankTransfer = (paymentId: string, receiptUrl: string, receipt?: File | null) => {
  const fd = new FormData();
  fd.append('paymentId', paymentId);
  fd.append('receiptUrl', receiptUrl);
  if (receipt) fd.append('receipt', receipt);
  return api.post('/payments/bank-transfer/confirm', fd);
};
export const getMyPayments = () => emptyOn404(api.get<Payment[]>('/payments/my-payments'));
export const getAllPayments = () => emptyOn404(api.get<Payment[]>('/payments'));
export const verifyPayment = (reference: string) => api.get<{ status?: string; message?: string }>(`/payments/verify/${reference}`);
export const approveTransfer = (id: string) => api.patch(`/payments/bank-transfer/${id}/approve`);
export const rejectTransfer = (id: string) => api.patch(`/payments/bank-transfer/${id}/reject`);

export function requestRefund(input: { orderId: string; type: 'DEFECT' | 'CANCELLATION'; resolution?: 'REFUND' | 'REPLACEMENT'; reason: string }, files: File[]) {
  const fd = new FormData();
  fd.append('orderId', input.orderId);
  fd.append('type', input.type);
  if (input.resolution) fd.append('resolution', input.resolution);
  fd.append('reason', input.reason);
  files.forEach((f) => fd.append('evidence', f));
  return api.post<Refund>('/refunds', fd);
}
export const getMyRefunds = () => api.get<Refund[]>('/refunds/mine');
export const listRefunds = (params: { status?: string; page?: number; limit?: number } = {}) => api.get<Page<Refund>>('/refunds', params);
export const getRefund = (id: string) => api.get<Refund>(`/refunds/${id}`);
export const verifyRefund = (id: string, approve: boolean, note: string) => api.patch<Refund>(`/refunds/${id}/verify`, { approve, note });
export const decideRefund = (id: string, approve: boolean, note: string) => api.patch<Refund>(`/refunds/${id}/decide`, { approve, note });
export const markReplacementSent = (id: string) => api.patch<Refund>(`/refunds/${id}/replacement-sent`, {});

export const listNotifications = () => api.get<AppNotification[]>('/notifications');
export const unreadCount = () => api.get<{ count: number }>('/notifications/unread-count');
export const markRead = (id: string) => api.patch(`/notifications/${id}/read`);
export const markAllRead = () => api.patch('/notifications/read-all');
