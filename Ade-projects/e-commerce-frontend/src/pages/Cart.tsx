import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import type { ProductVariant, Product } from '../types';
import { extractErrorMessage } from '../api/client';
import { useState } from 'react';

function isPopulatedVariant(v: ProductVariant | string): v is ProductVariant {
  return typeof v === 'object';
}

export default function Cart() {
  const { cart, loading, removeItem, clear } = useCart();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const items = (cart?.items ?? []).filter((i) => isPopulatedVariant(i.variant)) as {
    variant: ProductVariant;
    quantity: number;
  }[];

  const subtotal = items.reduce((sum, item) => {
    const price = item.variant.price ?? (typeof item.variant.product === 'object' ? (item.variant.product as Product).price : 0);
    return sum + price * item.quantity;
  }, 0);

  const handleRemove = async (variantId: string) => {
    setError('');
    try {
      await removeItem(variantId);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not remove that item.'));
    }
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-6 py-24 label-eyebrow">Tallying cart&hellip;</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <p className="label-eyebrow mb-2">Shopping Cart</p>
      <h1 className="text-4xl sm:text-5xl font-800 mb-8">Your Cart</h1>

      {error && <p className="text-warnred font-mono text-sm mb-4">{error}</p>}

      {items.length === 0 ? (
        <div className="ticket p-10 text-center">
          <p className="label-eyebrow mb-4">Cart is empty &mdash; no items queued for shipment.</p>
          <Link to="/" className="btn-primary inline-block">
            Browse Catalog
          </Link>
        </div>
      ) : (
        <div className="ticket p-6 sm:p-8">
          <div className="space-y-0">
            {items.map(({ variant, quantity }) => {
              const product = typeof variant.product === 'object' ? (variant.product as Product) : null;
              const price = variant.price ?? product?.price ?? 0;
              return (
                <div key={variant._id} className="dashed-rule py-4 first:border-t-0 first:pt-0 flex gap-4 items-center">
                  <div className="w-16 h-16 bg-manila/40 shrink-0 overflow-hidden">
                    {(variant.images?.[0] || product?.images?.[0]) && (
                      <img
                        src={variant.images?.[0] || product?.images?.[0]}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-lg uppercase leading-tight truncate">{product?.name ?? 'Item'}</p>
                    <p className="sku">
                      {variant.sku} &middot;{' '}
                      {Object.entries(variant.attributes || {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ')}
                    </p>
                    <p className="font-mono text-xs text-inkfaint mt-1">Qty {quantity}</p>
                  </div>
                  <p className="font-mono font-semibold whitespace-nowrap">${(price * quantity).toFixed(2)}</p>
                  <button
                    onClick={() => handleRemove(variant._id)}
                    className="label-eyebrow text-warnred hover:underline ml-2"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <div className="dashed-rule pt-4 mt-4 flex items-center justify-between">
            <button onClick={() => clear()} className="label-eyebrow text-inkfaint hover:text-warnred">
              Clear cart
            </button>
            <div className="text-right">
              <p className="label-eyebrow">Subtotal</p>
              <p className="font-mono text-2xl font-semibold">${subtotal.toFixed(2)}</p>
            </div>
          </div>

          <button className="btn-primary w-full mt-6" onClick={() => navigate('/checkout')}>
            Proceed to Checkout
          </button>
        </div>
      )}
    </div>
  );
}
