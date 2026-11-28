export type Role = 'superadmin' | 'admin' | 'manager' | 'customer';
export type Restriction = 'change-password' | 'two-factor';

export interface User {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: Role;
  profileImage?: string;
  restriction?: Restriction;
}

export interface Profile extends User {
  _id?: string;
  middlename?: string;
  phoneNumber?: string;
  address?: string;
  gender?: string;
  dateOfBirth?: string;
  isVerified?: boolean;
  twoFactorEnabled?: boolean;
  isActive?: boolean;
  deactivatedAt?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
}

export interface Brand { _id: string; name: string; description?: string }
export interface Category { _id: string; name: string; description?: string }

export interface Product {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  description?: string;
  price: number;
  discountPrice?: number;
  comparePrice?: number;
  createdBy?: { _id: string; firstname: string; lastname: string } | string | null;
  images?: string[];
  brand?: Brand | string;
  category?: Category | string;
  featured?: boolean;
  isActive: boolean;
  ratingAverage?: number;
  ratingCount?: number;
  ratingPositive?: number;
  dealEndsAt?: string | null;
  createdAt?: string;
}

export interface Variant {
  _id: string;
  product: string | Product;
  sku: string;
  price?: number;
  stock: number;
  attributes: Record<string, string>;
  images?: string[];
  isActive?: boolean;
}

export interface Meta { total: number; page: number; limit: number; totalPages: number }
export interface Paginated<T> { data: T[]; meta: Meta }

export interface CartItem { variant: Variant | string; quantity: number }
export interface Cart { _id?: string; items: CartItem[] }

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type OrderPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface OrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantSku: string;
  attributes: Record<string, string>;
  images: string[];
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ShippingAddress {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phoneNumber?: string;
}

export interface Order {
  _id: string;
  user: string | { _id: string; firstname?: string; lastname?: string; email?: string };
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  subtotal: number;
  total: number;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  deliveredAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type PaymentStatus = 'PENDING' | 'AWAITING_CONFIRMATION' | 'PAID' | 'FAILED' | 'REFUNDED';
export interface Payment {
  _id: string;
  order: string | { _id: string };
  user?: string | { _id: string; firstname?: string; lastname?: string; email?: string };
  amount: number;
  currency: string;
  provider: 'PAYSTACK' | 'BANK_TRANSFER';
  status: PaymentStatus;
  transactionReference: string;
  receipt?: string;
  receiptUrl?: string;
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  refundedAmount?: number;
  createdAt: string;
}

export type RefundStatus =
  | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'DECLINED' | 'REFUNDED'
  | 'REPLACEMENT_APPROVED' | 'REPLACEMENT_SENT';
export interface Refund {
  id: string;
  order: string;
  user?: string;
  type: 'DEFECT' | 'CANCELLATION';
  resolution: 'REFUND' | 'REPLACEMENT';
  reason: string;
  evidence: string[];
  evidenceCount: number;
  amount: number;
  status: RefundStatus;
  verificationNote?: string | null;
  decisionNote?: string | null;
  createdAt: string;
}

export interface Page<T> { items: T[]; total: number; page: number; limit: number }

export interface AppNotification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuditEntry {
  _id: string;
  actorId?: string | null;
  action: string;
  target?: { type: string; id: string } | null;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  twoFactorEnabled: boolean;
  totalActions: number;
  lastActionAt: string | null;
  deletes: number;
  lookups: number;
  offHoursActions: number;
  flags: string[];
  actions: Record<string, number>;
}

export interface SalesReport {
  from: string;
  to: string;
  totals: { orders: number; payments: number; revenue: number; refunds: number; refundedAmount: number; newCustomers: number };
  byDay: { day: string; orders: number; payments: number; revenue: number }[];
}

export interface ReviewReply { _id: string; user: string; authorName: string; authorRole: Role; text: string; createdAt: string }
export interface Review {
  _id: string;
  product: string | { _id: string; name: string; images?: string[] };
  user: string;
  authorName: string;
  authorRole: Role;
  rating: number;
  comment: string;
  edited: boolean;
  replies: ReviewReply[];
  createdAt: string;
  updatedAt?: string;
}
export interface RatingSummary { average: number; count: number; breakdown: Record<'1' | '2' | '3' | '4' | '5', number> }
export interface ReviewPage { data: Review[]; meta: Meta; summary?: RatingSummary }
