/**
 * User Roles
 *
 * Every authenticated user belongs to one role. They sit in a ladder
 * (superadmin > admin > manager > customer), and each staff role owns one area:
 * - manager: the shop floor (products, stock, orders, helping customers)
 * - admin: money and accounts (payments, refunds, customer accounts, managers)
 * - superadmin: oversight (appoints admins and managers, audit log, reports)
 */

export enum Role {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  MANAGER = 'manager',
  CUSTOMER = 'customer',
}
