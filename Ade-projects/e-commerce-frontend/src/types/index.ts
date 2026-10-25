export type Role = 'CUSTOMER' | 'ADMIN';

export interface User {
  id: string;
  _id?: string;
  firstname: string;
  lastname: string;
  email: string;
  role: Role;
  profileImage?: string;
}

export interface Brand {
  _id: string;
  name: string;
  logo?: string;
  slug?: string;
}

export interface Category {
  _id: string;
  name: string;
  slug?: string;
}

export interface Product {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  description?: string;
  price: number;
  images: string[];
  brand?: Brand | string;
  category?: Category | string;
  featured?: boolean;
  isActive: boolean;
}

export interface ProductVariant {
  _id: string;
  product: string | Product;
  sku: string;
  price?: number;
  stock: number;
  attributes: Record<string, string>;
  images?: string[];
  isActive?: boolean;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface CartItem {
  variant: ProductVariant | string;
  quantity: number;
}

export interface Cart {
  _id?: string;
  items: CartItem[];
}

export type OrderStatus = 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

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
  user: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  subtotal: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
}
