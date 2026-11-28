import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuArrowRight, LuMinus, LuPlus, LuShoppingBag, LuTrash2 } from 'react-icons/lu';
import { EmptyState, PageLoader, Spinner } from '../components/ui';
import { ProductImage } from '../components/ProductCard';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { errorMessage } from '../api/client';
import { money } from '../lib/format';

export default function Cart() {
  const { lines, subtotal, loading, setQuantity, remove, clear } = useCart();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  };

  if (loading && lines.length === 0) return <PageLoader label="Loading your cart" />;
  if (lines.length === 0) {
    return (
      <div className="container-x py-16">
        <EmptyState icon={<LuShoppingBag />} title="Your cart is empty" text="Add something you love and it will wait for you here." action={<Link to="/shop" className="btn-primary">Browse products <LuArrowRight /></Link>} />
      </div>
    );
  }

  return (
    <div className="container-x py-8 sm:py-10">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Your cart</h1>
        <button className="text-sm font-semibold text-rose-600 hover:underline" onClick={() => run('clear', clear)}>Clear cart</button>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <ul className="space-y-4">
          {lines.map((l) => {
            const id = l.variant._id;
            const attrs = Object.entries(l.variant.attributes ?? {});
            return (
              <li key={id} className="card flex gap-4 p-4 sm:gap-5 sm:p-5">
                <Link to={`/product/${l.product?._id ?? ''}`} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-brand-50 sm:h-28 sm:w-28"><ProductImage product={l.product} /></Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/product/${l.product?._id ?? ''}`} className="line-clamp-2 font-display font-semibold hover:text-brand-600">{l.product?.name ?? 'Product no longer available'}</Link>
                      <p className="mt-0.5 text-xs text-mute">{attrs.map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
                    </div>
                    <button aria-label="Remove item" className="rounded-lg p-2 text-mute hover:bg-rose-50 hover:text-rose-600" onClick={() => run(id, () => remove(id))}>{busy === id ? <Spinner /> : <LuTrash2 />}</button>
                  </div>
                  <div className="mt-auto flex items-end justify-between pt-3">
                    <div className="inline-flex items-center rounded-xl border border-line bg-white">
                      <button className="grid h-9 w-9 place-items-center hover:text-brand-600 disabled:opacity-40" disabled={busy === id} onClick={() => run(id, () => setQuantity(id, l.quantity - 1))} aria-label="Decrease quantity"><LuMinus /></button>
                      <span className="w-8 text-center text-sm font-semibold">{l.quantity}</span>
                      <button className="grid h-9 w-9 place-items-center hover:text-brand-600 disabled:opacity-40" disabled={busy === id || l.quantity >= l.variant.stock} onClick={() => run(id, () => setQuantity(id, l.quantity + 1))} aria-label="Increase quantity"><LuPlus /></button>
                    </div>
                    <div className="text-right"><p className="font-display text-lg font-bold">{money(l.total)}</p>{l.quantity > 1 && <p className="text-xs text-mute">{money(l.unit)} each</p>}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="card-pad h-fit lg:sticky lg:top-24">
          <h2 className="font-display text-xl font-bold">Order summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-mute">Subtotal</dt><dd className="font-semibold">{money(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-mute">Delivery</dt><dd className="font-semibold text-emerald-600">Included</dd></div>
            <div className="flex justify-between border-t border-line pt-4 text-base"><dt className="font-bold">Total</dt><dd className="font-display text-2xl font-extrabold gradient-text">{money(subtotal)}</dd></div>
          </dl>
          <button className="btn-primary btn-lg mt-6 w-full" onClick={() => nav('/checkout')}>Checkout <LuArrowRight /></button>
          <Link to="/shop" className="mt-3 block text-center text-sm font-semibold text-brand-600 hover:underline">Continue shopping</Link>
        </aside>
      </div>
    </div>
  );
}
