import { api } from './client';

// Matches NotificationType in the backend's notification.schema.ts exactly.
export type NotificationType =
  | 'ORDER_PLACED'
  | 'NEW_ORDER'
  | 'ORDER_STATUS_CHANGED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_REFUNDED'
  | 'TRANSFER_SUBMITTED'
  | 'TRANSFER_REJECTED'
  | 'LOW_STOCK'
  | 'USER_SIGNUP'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'ADMIN_PROFILE_CREATED'
  | 'PROFILE_UPDATED'
  | 'ACCOUNT_DEACTIVATED';

export interface AppNotification {
  _id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export async function listNotifications(unreadOnly = false) {
  const { data } = await api.get<AppNotification[]>('/notifications', {
    params: unreadOnly ? { unreadOnly: true } : undefined,
  });
  return data;
}

export async function getUnreadCount() {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

export async function markNotificationRead(id: string) {
  const { data } = await api.patch<AppNotification>(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.patch<{ message: string }>('/notifications/read-all');
  return data;
}
