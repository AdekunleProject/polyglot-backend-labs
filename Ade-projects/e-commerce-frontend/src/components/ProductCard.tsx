import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuPlus, LuShoppingBag, LuStar } from 'react-icons/lu';
import { listVariants } from '../api/catalog';
import { errorMessage } from '../api/client';
import { money, nameOf } from '../lib/format';
import { productArt } from '../lib/art';
import { Countdown } from './Countdown';
import { RatingLine } from './Reviews';
import { Spinner } from './ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import type { Product } from '../types';

export function ProductImage({ product, index = 0, className = '' }: { product?: Pick<Product, 'name' | 'images'>; index?: number; className?: string }) {
  const src = product?.images?.[index] || productArt(product?.name ?? 'harlim');
  return <img src={src} alt={product?.name ?? 'Product'} loading="lazy" className={`${/\b[hw]-\d/.test(className) ? '' : 'h-full w-full'} object-cover ${className}`} />;
}

/** The store's bag icon with a plus, used to add a product without opening it. */
export function CartPlusButton({ product, className = '' }: { product: Product; className?: string }) {
  const { user } = useAuth();
  const { add } = useCart();
  const toast = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (user && user.role !== 'customer') return null;

  const click = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!user) { nav('/login', { state: { from: `/product/${product._id}` } }); return; }
    setBusy(true);
    try {
      const variants = (await listVariants(product._id)).filter((v) => v.stock > 0);
      if (variants.length === 0) { toast.error(`${product.name} is out of stock.`); return; }
      if (variants.length > 1) { toast.info('Pick a colour or size first.'); nav(`/product/${product._id}`); return; }
      await add(variants[0]._id, 1);
      setDone(true); window.setTimeout(() => setDone(false), 1600);
      toast.success(`${product.name} added to your bag`);
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <button type="button" onClick={click} disabled={busy} aria-label={`Add ${product.name} to cart`} title="Add to cart"
      className={`relative grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 transition active:scale-90 ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink/80 text-ink hover:border-brand-600 hover:bg-brand-600 hover:text-white'} ${className}`}>
      {busy ? <Spinner /> : <LuShoppingBag size={19} />}
      {!busy && !done && <LuPlus size={11} strokeWidth={3.5} className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2" />}
    </button>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/product/${product._id}`} className="group card flex h-full flex-col overflow-hidden transition duration-300 hover:-translate-y-1.5 hover:shadow-lift">
      <div className="relative aspect-square overflow-hidden bg-brand-50">
        <ProductImage product={product} className="transition duration-500 group-hover:scale-110" />
        {product.featured && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-night-900/85 px-2.5 py-1 text-[11px] font-bold text-gold-300 backdrop-blur">
            <LuStar className="fill-gold-300" /> Featured
          </span>
        )}
        <Countdown endsAt={product.dealEndsAt} className="absolute bottom-2.5 left-2.5" />
      </div>
      <div className="flex flex-1 flex-col p-3.5 sm:p-4">
        <p className="truncate text-[11px] font-bold uppercase tracking-wider text-brand-600">{nameOf(product.brand) || nameOf(product.category)}</p>
        <h3 className="mt-1 line-clamp-2 min-h-[2.6rem] font-display text-[15px] font-semibold leading-snug">{product.name}</h3>
        <RatingLine average={product.ratingAverage} count={product.ratingCount} positive={product.ratingPositive} className="mt-1.5" />
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <p className="font-display text-lg font-bold leading-none">{money(product.price)}</p>
          <CartPlusButton product={product} />
        </div>
      </div>
    </Link>
  );
}

/**
 * Products in one row that swipes sideways on a phone, and a normal grid from tablet width up.
 */
export function ProductRail({ children, className = '' }: { children: ReactNode[] | ReactNode; className?: string }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className={`-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:snap-none sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 sm:grid-cols-3 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden ${className}`}>
      {items.map((child, i) => (
        <div key={i} className="w-[46vw] max-w-60 shrink-0 snap-start sm:w-auto sm:max-w-none">{child}</div>
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="skeleton aspect-square rounded-none" />
          <div className="space-y-2 p-4"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-5 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}
