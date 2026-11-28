import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as shop from '../api/shop';
import { getProduct } from '../api/catalog';
import { useAuth } from './AuthContext';
import { priceOf } from '../lib/format';
import type { Cart, Product, Variant } from '../types';

export interface CartLine { variant: Variant; product: Product | undefined; quantity: number; unit: number; total: number }

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  loading: boolean;
  add: (variantId: string, quantity?: number) => Promise<void>;
  remove: (variantId: string) => Promise<void>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  clear: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<CartState | null>(null);
const productCache = new Map<string, Product>();

async function resolve(cart: Cart): Promise<CartLine[]> {
  const variants = cart.items.map((i) => ({ v: i.variant as Variant, q: i.quantity })).filter((x) => typeof x.v === 'object');
  const ids = [...new Set(variants.map((x) => (typeof x.v.product === 'string' ? x.v.product : x.v.product._id)))];
  await Promise.all(ids.filter((id) => !productCache.has(id)).map(async (id) => {
    try { productCache.set(id, await getProduct(id)); } catch { /* product removed */ }
  }));
  return variants.map(({ v, q }) => {
    const pid = typeof v.product === 'string' ? v.product : v.product._id;
    const product = productCache.get(pid);
    const unit = priceOf(v, product);
    return { variant: v, product, quantity: q, unit, total: unit * q };
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [loading, setLoading] = useState(false);
  const isCustomer = user?.role === 'customer';

  const apply = useCallback(async (cart: Cart) => setLines(await resolve(cart)), []);
  const reload = useCallback(async () => {
    if (!isCustomer) { setLines([]); return; }
    setLoading(true);
    try { await apply(await shop.getCart()); } catch { setLines([]); } finally { setLoading(false); }
  }, [isCustomer, apply]);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<CartState>(() => ({
    lines, loading, reload,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal: lines.reduce((n, l) => n + l.total, 0),
    add: async (variantId, quantity = 1) => { await apply(await shop.addCartItem(variantId, quantity)); },
    remove: async (variantId) => { await apply(await shop.removeCartItem(variantId)); },
    setQuantity: async (variantId, quantity) => {
      const line = lines.find((l) => l.variant._id === variantId);
      if (!line) return;
      const diff = quantity - line.quantity;
      if (diff > 0) await apply(await shop.addCartItem(variantId, diff));
      else if (quantity <= 0) await apply(await shop.removeCartItem(variantId));
      else {
        // The API only adds; to lower a quantity we replace the line.
        await shop.removeCartItem(variantId);
        await apply(await shop.addCartItem(variantId, quantity));
      }
    },
    clear: async () => { await apply(await shop.clearCart()); },
  }), [lines, loading, reload, apply]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCart must be used inside CartProvider');
  return c;
}
