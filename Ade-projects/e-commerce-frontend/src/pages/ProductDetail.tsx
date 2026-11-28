import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LuMinus, LuPlus, LuRotateCcw, LuShieldCheck, LuShoppingBag, LuTruck } from 'react-icons/lu';
import { getProduct, listProducts, listVariants } from '../api/catalog';
import { errorMessage } from '../api/client';
import { Breadcrumb, ErrorState, PageLoader, SectionHead, Spinner, useAsync } from '../components/ui';
import { ProductCard, ProductRail, ProductImage } from '../components/ProductCard';
import { useAuth } from '../context/AuthContext';
import { Countdown } from '../components/Countdown';
import { ShareButton } from '../components/Share';
import { appUrl } from '../lib/url';
import { RatingLine, ReviewSection } from '../components/Reviews';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { idOf, money, nameOf, priceOf } from '../lib/format';

export default function ProductDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();

  const product = useAsync(() => getProduct(id), [id]);
  const variants = useAsync(() => listVariants(id), [id]);
  const related = useAsync(async () => {
    const p = await getProduct(id);
    const r = await listProducts({ category: idOf(p.category), limit: 5 });
    return r.data.filter((x) => x._id !== id).slice(0, 4);
  }, [id]);

  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const [busy, setBusy] = useState(false);

  const list = variants.data ?? [];
  const keys = useMemo(() => [...new Set(list.flatMap((v) => Object.keys(v.attributes ?? {})))], [list]);
  const optionsFor = (k: string) => [...new Set(list.map((v) => v.attributes?.[k]).filter(Boolean))] as string[];

  useEffect(() => {
    if (!list.length) return;
    const first = list.find((v) => v.stock > 0) ?? list[0];
    setChosen({ ...first.attributes });
    setQty(1); setImg(0);
  }, [id, variants.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = list.find((v) => keys.every((k) => v.attributes?.[k] === chosen[k]));
  const p = product.data;
  const price = priceOf(selected, p ?? undefined);
  const inStock = (selected?.stock ?? 0) > 0;
  const available = (k: string, value: string) => list.some((v) => v.stock > 0 && v.attributes?.[k] === value && keys.every((o) => o === k || !chosen[o] || v.attributes?.[o] === chosen[o]));

  if (product.loading && !product.data) return <PageLoader label="Loading product" />;
  if (product.error || !p) return <div className="container-x py-12"><ErrorState error={product.error ?? new Error('Not found')} onRetry={product.reload} /></div>;

  const images = (selected?.images?.length ? selected.images : p.images) ?? [];
  const gallery = images.length ? images : [''];

  const addToCart = async (buyNow = false) => {
    if (!user) { nav('/login', { state: { from: `/product/${id}` } }); return; }
    if (!selected) { toast.error('Choose an option first.'); return; }
    setBusy(true);
    try {
      await cart.add(selected._id, qty);
      toast.success(`${p.name} added to your cart.`);
      if (buyNow) nav('/cart');
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const staff = user && user.role !== 'customer';

  return (
    <div className="container-x py-8 sm:py-10">
      <Breadcrumb items={[{ label: 'Shop', to: '/shop' }, ...(nameOf(p.category) ? [{ label: nameOf(p.category), to: `/shop?category=${idOf(p.category)}` }] : []), { label: p.name }]} />
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="card aspect-square overflow-hidden"><ProductImage product={{ name: p.name, images: gallery.filter(Boolean) }} index={Math.min(img, gallery.length - 1)} /></div>
          {gallery.length > 1 && (
            <div className="mt-3 grid grid-cols-5 gap-3">
              {gallery.map((src, i) => (
                <button key={i} onClick={() => setImg(i)} aria-label={`Image ${i + 1}`} className={`aspect-square overflow-hidden rounded-xl border-2 transition ${i === img ? 'border-brand-500 shadow-glow' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {nameOf(p.brand) && <Link to={`/shop?brand=${idOf(p.brand)}`} className="badge-violet">{nameOf(p.brand)}</Link>}
            {p.featured && <span className="badge-amber">Featured</span>}
            <ShareButton target={{ title: p.name, text: `${p.name} on Harlim ShopAll for ${money(price)}.`, url: appUrl(`/product/${id}`) }} className="btn-ghost btn-sm ml-auto" />
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">{p.name}</h1>
          <button type="button" className="mt-3 text-left" onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })} aria-label="Jump to ratings and comments">
            <RatingLine average={p.ratingAverage} count={p.ratingCount} positive={p.ratingPositive} className="text-sm" />
          </button>
          <p className="mt-4 font-display text-4xl font-extrabold gradient-text">{money(price)}</p>
          <Countdown endsAt={p.dealEndsAt} variant="block" className="mt-3" />
          <p className="mt-2 text-xs text-mute">SKU {selected?.sku ?? p.sku} · Delivery fee shown at checkout</p>
          <p className="mt-6 leading-relaxed text-ink/75">{p.description}</p>

          {variants.loading ? <div className="mt-6"><Spinner className="text-brand-600" /></div> : list.length === 0 ? (
            <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-700">This product has no purchasable options yet.</p>
          ) : (
            <div className="mt-7 space-y-5">
              {keys.map((k) => (
                <div key={k}>
                  <p className="label">{k}: <span className="normal-case tracking-normal text-ink">{chosen[k]}</span></p>
                  <div className="flex flex-wrap gap-2">
                    {optionsFor(k).map((o) => (
                      <button key={o} onClick={() => setChosen((c) => ({ ...c, [k]: o }))} aria-pressed={chosen[k] === o}
                        className={`min-w-12 rounded-xl border px-4 py-2 text-sm font-semibold transition ${chosen[k] === o ? 'border-brand-600 bg-brand-50 text-brand-700 ring-2 ring-brand-200' : 'border-line bg-white hover:border-brand-300'} ${available(k, o) ? '' : 'opacity-45 line-through'}`}>{o}</button>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex flex-wrap items-center gap-4">
                <div className="inline-flex items-center rounded-xl border border-line bg-white">
                  <button className="grid h-11 w-11 place-items-center text-lg hover:text-brand-600 disabled:opacity-40" disabled={qty <= 1} onClick={() => setQty(qty - 1)} aria-label="Decrease quantity"><LuMinus /></button>
                  <span className="w-10 text-center font-semibold" aria-live="polite">{qty}</span>
                  <button className="grid h-11 w-11 place-items-center text-lg hover:text-brand-600 disabled:opacity-40" disabled={qty >= (selected?.stock ?? 1)} onClick={() => setQty(qty + 1)} aria-label="Increase quantity"><LuPlus /></button>
                </div>
                <p className={`text-sm font-semibold ${!selected ? 'text-mute' : inStock ? ((selected.stock <= 5) ? 'text-amber-600' : 'text-emerald-600') : 'text-rose-600'}`}>
                  {!selected ? 'This combination is unavailable' : inStock ? (selected.stock <= 5 ? `Only ${selected.stock} left` : 'In stock') : 'Out of stock'}
                </p>
              </div>

              {staff ? (
                <p className="rounded-xl bg-brand-50 p-4 text-sm font-medium text-brand-800">You are signed in as staff. Customers buy from this page; staff manage it in the console.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button className="btn-primary btn-lg flex-1 sm:flex-none" disabled={!inStock || busy} onClick={() => addToCart(false)}>{busy ? <Spinner /> : <LuShoppingBag />} Add to cart</button>
                  <button className="btn-dark btn-lg" disabled={!inStock || busy} onClick={() => addToCart(true)}>Buy now</button>
                </div>
              )}
            </div>
          )}

          <ul className="mt-8 grid gap-3 border-t border-line pt-6 text-sm sm:grid-cols-3">
            <li className="flex items-center gap-2"><LuTruck className="text-lg text-brand-600" /> Tracked delivery</li>
            <li className="flex items-center gap-2"><LuRotateCcw className="text-lg text-brand-600" /> 24h refund cover</li>
            <li className="flex items-center gap-2"><LuShieldCheck className="text-lg text-brand-600" /> Secure checkout</li>
          </ul>
        </div>
      </div>

      {!staff && list.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
          <div className="min-w-0"><p className="truncate text-[11px] text-mute">{p.name}</p><p className="font-display text-lg font-extrabold leading-none">{money(price)}</p></div>
          <button className="btn-primary ml-auto" disabled={!inStock || busy} onClick={() => addToCart(false)}>{busy ? <Spinner /> : <LuShoppingBag />} {inStock ? 'Add to cart' : 'Sold out'}</button>
        </div>
      )}

      <ReviewSection productId={id} onSummary={product.reload} />

      {(related.data?.length ?? 0) > 0 && (
        <section className="mt-20">
          <SectionHead eyebrow="You may also like" title="Similar products" />
          <ProductRail>{related.data!.map((x) => <ProductCard key={x._id} product={x} />)}</ProductRail>
        </section>
      )}
    </div>
  );
}
