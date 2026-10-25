import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { Cart } from '../types';
import * as cartApi from '../api/cart';
import { useAuth } from './AuthContext';

interface CartContextValue {
  cart: Cart | null;
  loading: boolean;
  itemCount: number;
  refresh: () => Promise<void>;
  addItem: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setCart(null);
      return;
    }
    setLoading(true);
    try {
      const data = await cartApi.getCart();
      setCart(data);
    } catch {
      setCart(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = async (variantId: string, quantity: number) => {
    const data = await cartApi.addCartItem(variantId, quantity);
    setCart(data);
  };

  const removeItem = async (variantId: string) => {
    const data = await cartApi.removeCartItem(variantId);
    setCart(data);
  };

  const clear = async () => {
    await cartApi.clearCart();
    setCart({ items: [] });
  };

  const itemCount = cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <CartContext.Provider value={{ cart, loading, itemCount, refresh, addItem, removeItem, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
