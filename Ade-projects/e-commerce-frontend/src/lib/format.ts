import type { Brand, Category, OrderPaymentStatus, OrderStatus, PaymentStatus, Product, RefundStatus, Role, Variant } from '../types';

const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });
const nairaExact = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 });

export const money = (n: number | undefined | null) => naira.format(Number(n ?? 0));
export const moneyExact = (n: number | undefined | null) => nairaExact.format(Number(n ?? 0));
export const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const dateShort = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return dateShort(iso);
}

export const titleCase = (s: string) => s.replace(/[_-]/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'gray';
export const ORDER_TONE: Record<OrderStatus, Tone> = {
  pending: 'amber', processing: 'blue', shipped: 'violet', delivered: 'green', cancelled: 'red',
};
export const ORDER_PAY_TONE: Record<OrderPaymentStatus, Tone> = {
  pending: 'amber', paid: 'green', failed: 'red', refunded: 'gray',
};
export const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  PENDING: 'amber', AWAITING_CONFIRMATION: 'blue', PAID: 'green', FAILED: 'red', REFUNDED: 'gray',
};
export const REFUND_TONE: Record<RefundStatus, Tone> = {
  SUBMITTED: 'amber', VERIFIED: 'blue', REJECTED: 'red', DECLINED: 'red', REFUNDED: 'green',
  REPLACEMENT_APPROVED: 'violet', REPLACEMENT_SENT: 'green',
};
export const ORDER_STEPS: OrderStatus[] = ['pending', 'processing', 'shipped', 'delivered'];

export const isStaff = (role?: Role) => role === 'manager' || role === 'admin' || role === 'superadmin';
export const ROLE_LABEL: Record<Role, string> = { superadmin: 'Super admin', admin: 'Admin', manager: 'Manager', customer: 'Customer' };

export const nameOf = (x?: string | Brand | Category | null): string => (x && typeof x === 'object' ? x.name : '');
export const idOf = (x?: string | { _id: string } | null): string => (x && typeof x === 'object' ? x._id : x ?? '');

/** The backend charges variant.price when it is set, otherwise the product price. */
export const priceOf = (variant: Variant | undefined, product: Product | undefined): number =>
  (variant?.price && variant.price > 0 ? variant.price : product?.price) ?? 0;

export function personName(u?: string | { firstname?: string; lastname?: string; email?: string } | null): string {
  if (!u || typeof u === 'string') return '';
  return [u.firstname, u.lastname].filter(Boolean).join(' ') || u.email || '';
}

/** Share of ratings that are 4 or 5 stars, as a whole percent. */
export const positivePercent = (count?: number, positive?: number) => (count ? Math.round(((positive ?? 0) / count) * 100) : 0);

/** More than 65% positive ratings is Excellent, anything lower is Good. No ratings, no label. */
export function ratingBand(count?: number, positive?: number): 'excellent' | 'good' | null {
  if (!count) return null;
  return (positive ?? 0) / count > 0.65 ? 'excellent' : 'good';
}

/** Whole-number percent saved between the crossed-out price and the selling price. Zero when there is no real saving. */
export const percentOff = (price?: number, compare?: number) => (compare && price && compare > price ? Math.round(((compare - price) / compare) * 100) : 0);

/** "2 days 5 hours left", "3 hours 10 minutes left" or "Expired". */
export function timeLeftText(iso?: string | null, now = Date.now()): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return 'Expired';
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (d > 0) return `${plural(d, 'day')} ${plural(h, 'hour')} left`;
  if (h > 0) return `${plural(h, 'hour')} ${plural(m, 'minute')} left`;
  return `${plural(Math.max(1, m), 'minute')} left`;
}
