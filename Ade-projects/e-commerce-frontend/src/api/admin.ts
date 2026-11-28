import { api } from './client';
import type { AuditEntry, Page, Profile, Role, SalesReport, StaffRow } from '../types';

export const listUsers = (params: { page?: number; limit?: number; search?: string; deleted?: boolean } = {}) =>
  api.get<Page<Profile>>('/users', params);
export const changeRole = (id: string, role: Role) => api.patch(`/users/${id}/role`, { role });
export const deactivateUser = (id: string, reason: string) => api.patch(`/users/${id}/deactivate`, { reason });
export const activateUser = (id: string) => api.patch(`/users/${id}/activate`, {});
export const deleteUser = (id: string, reason: string) => api.delete(`/users/${id}`, { reason });
export const restoreUser = (id: string) => api.patch(`/users/${id}/restore`, {});
export const createStaff = (body: Record<string, string>) => api.post('/users/create-admin-profile', body);

export const dashboard = (kind: 'manager' | 'admin' | 'superadmin' | 'customer') =>
  api.get<Record<string, any>>(`/analytics/${kind}`); // eslint-disable-line @typescript-eslint/no-explicit-any
export const staffActivity = (from?: string, to?: string) =>
  api.get<{ from: string; to: string; staff: StaffRow[] }>('/analytics/staff-activity', { from, to });
export const salesReport = (from?: string, to?: string) => api.get<SalesReport>('/analytics/sales', { from, to });
export const downloadCsv = (path: '/analytics/staff-activity' | '/analytics/sales', from?: string, to?: string) =>
  api.get<string>(path, { from, to, format: 'csv' }, 'text');
export const sendDigest = () => api.post<{ message?: string }>('/analytics/digest/send');

export const auditLog = (params: { page?: number; limit?: number; action?: string } = {}) =>
  api.get<Page<AuditEntry>>('/audit-logs', params);
