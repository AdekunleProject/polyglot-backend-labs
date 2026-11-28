import { Link } from 'react-router-dom';
import { LuArrowRight, LuHeadphones, LuRotateCcw, LuShieldCheck, LuSparkles, LuTruck, LuWatch, LuSmartphone, LuLaptop, LuShirt, LuHouse, LuFootprints, LuBriefcase, LuFlower } from 'react-icons/lu';
import { listBrands, listCategories, listProducts } from '../api/catalog';
import { ErrorState, SectionHead, useAsync } from '../components/ui';
import { ProductCard, ProductRail, ProductGridSkeleton, ProductImage } from '../components/ProductCard';
import { money } from '../lib/format';
import type { Product } from '../types';

const CAT_ICONS: Record<string, JSX.Element> = {
  'Phones & Tablets': <LuSmartphone />, Computing: <LuLaptop />, Audio: <LuHeadphones />, Watches: <LuWatch />,
  Fashion: <LuShirt />, Footwear: <LuFootprints />, 'Home & Living': <LuHouse />, Beauty: <LuFlower />, Bags: <LuBriefcase />,
};
const CAT_TONES = ['from-violet-500 to-fuchsia-500', 'from-sky-500 to-indigo-500', 'from-rose-500 to-orange-400', 'from-emerald-500 to-sky-500', 'from-fuchsia-500 to-pink-500', 'from-amber-500 to-rose-500', 'from-teal-500 to-indigo-500', 'from-pink-500 to-violet-500', 'from-slate-600 to-violet-600'];

function Hero({ picks, products, categories }: { picks: Product[]; products?: number; categories?: number }) {
  return (
    <section className="hero-bg relative isolate overflow-hidden text-white">
      <div className="grid-lines absolute inset-0 -z-10" />
      <div className="absolute -left-24 top-10 -z-10 h-72 w-72 animate-drift rounded-full bg-brand-600/40 blur-3xl" />
      <div className="absolute -right-10 bottom-0 -z-10 h-80 w-80 animate-drift rounded-full bg-flame-500/30 blur-3xl [animation-delay:-6s]" />
      <div className="container-x grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:py-28">
        <div className="animate-rise">
          <span className="glass inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white/90">
            <LuSparkles className="text-gold-400" /> New season picks are here
          </span>
          <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.04] sm:text-6xl lg:text-7xl">
            Everything you need,<br /><span className="gold-text">one place.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
            Phones, fashion, home and more from brands you trust. Pay securely, track every step and get covered by Harlim buyer protection.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/shop" className="btn-primary btn-lg">Start shopping <LuArrowRight /></Link>
            <Link to="/shop?featured=true" className="btn-light btn-lg">See featured</Link>
          </div>
          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
            {[[products ?? '—', 'Products'], [categories ?? '—', 'Categories'], ['72h', 'Fault cover']].map(([v, l]) => (
              <div key={l}><dt className="font-display text-3xl font-bold">{v}</dt><dd className="text-xs uppercase tracking-wider text-white/55">{l}</dd></div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto hidden h-[460px] w-full max-w-lg lg:block">
          {picks.slice(0, 3).map((p, i) => {
            const pos = ['left-0 top-6 w-56 -rotate-6', 'right-0 top-0 w-60 rotate-6 [animation-delay:-2s]', 'left-16 bottom-0 w-64 rotate-2 [animation-delay:-4s]'][i];
            return (
              <Link key={p._id} to={`/product/${p._id}`} className={`glass absolute animate-float p-3 transition hover:scale-105 ${pos}`}>
                <div className="aspect-square overflow-hidden rounded-xl"><ProductImage product={p} /></div>
                <p className="mt-3 truncate font-display text-sm font-semibold">{p.name}</p>
                <p className="text-sm font-bold text-gold-300">{money(p.price)}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const PERKS = [
  { icon: <LuTruck />, title: 'Fast delivery', text: 'Tracked from our warehouse to your door.' },
  { icon: <LuShieldCheck />, title: 'Secure payments', text: 'Card or bank transfer, confirmed in minutes.' },
  { icon: <LuRotateCcw />, title: 'Buyer protection', text: 'Faulty item? Refund in 24h, replacement in 72h.' },
  { icon: <LuHeadphones />, title: 'Real support', text: 'People who answer, six days a week.' },
];

export default function Home() {
  const featured = useAsync(() => listProducts({ featured: true, limit: 8 }), []);
  const cats = useAsync(listCategories, []);
  const brands = useAsync(listBrands, []);
  const fresh = useAsync(() => listProducts({ limit: 4, sortBy: 'createdAt', sortOrder: 'desc' }), []);

  return (
    <>
      <Hero picks={featured.data?.data ?? []} products={fresh.data?.meta.total} categories={cats.data?.length} />

      <section className="container-x relative z-10 -mt-8">
        <div className="card grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map((p) => (
            <div key={p.title} className="flex items-start gap-3 rounded-xl p-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-xl text-brand-600">{p.icon}</span>
              <div><p className="font-display text-sm font-bold">{p.title}</p><p className="text-xs leading-relaxed text-mute">{p.text}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="container-x mt-20">
        <SectionHead eyebrow="Browse" title="Shop by category" action={<Link to="/shop" className="hidden text-sm font-semibold text-brand-600 hover:underline sm:block">View all →</Link>} />
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-3 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-5 xl:grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] [&::-webkit-scrollbar]:hidden">
          {(cats.data ?? []).map((c, i) => (
            <Link key={c._id} to={`/shop?category=${c._id}`} className="group relative w-40 shrink-0 snap-start overflow-hidden md:w-auto rounded-2xl p-5 text-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift">
              <div className={`absolute inset-0 bg-gradient-to-br ${CAT_TONES[i % CAT_TONES.length]}`} />
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15 transition duration-500 group-hover:scale-150" />
              <div className="relative">
                <span className="text-3xl">{CAT_ICONS[c.name] ?? <LuSparkles />}</span>
                <p className="mt-6 font-display text-base font-bold leading-tight">{c.name}</p>
                <p className="mt-1 flex items-center gap-1 text-xs text-white/80 opacity-0 transition group-hover:opacity-100">Explore <LuArrowRight /></p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="container-x mt-20">
        <SectionHead eyebrow="Hand-picked" title="Featured this week" action={<Link to="/shop?featured=true" className="text-sm font-semibold text-brand-600 hover:underline">See all →</Link>} />
        {featured.loading ? <ProductGridSkeleton /> : featured.error ? <ErrorState error={featured.error} onRetry={featured.reload} /> : (
          <ProductRail>
            {featured.data!.data.slice(0, 8).map((p) => <ProductCard key={p._id} product={p} />)}
          </ProductRail>
        )}
      </section>

      <section className="container-x mt-20">
        <div className="hero-bg relative isolate overflow-hidden rounded-3xl px-6 py-12 text-white sm:px-12 sm:py-16">
          <div className="grid-lines absolute inset-0 -z-10 opacity-60" />
          <div className="grid items-center gap-8 md:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="eyebrow text-gold-300!">Buyer protection</p>
              <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">Shop with a safety net.</h2>
              <p className="mt-4 max-w-lg text-white/70">If something arrives broken, tell us with a photo. Report it within 24 hours for a full refund, or within 72 hours for a free replacement. Cancel before it arrives and get 65% back.</p>
              <Link to="/shop" className="btn-primary mt-7">Shop with confidence <LuArrowRight /></Link>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[['24h', 'Refund window'], ['72h', 'Replacement'], ['65%', 'Cancel refund']].map(([v, l]) => (
                <div key={l} className="glass p-4"><p className="font-display text-2xl font-extrabold gold-text">{v}</p><p className="mt-1 text-[11px] uppercase tracking-wider text-white/60">{l}</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-x mt-20">
        <SectionHead eyebrow="Just in" title="New arrivals" />
        {fresh.loading ? <ProductGridSkeleton n={4} /> : (
          <ProductRail>{(fresh.data?.data ?? []).map((p) => <ProductCard key={p._id} product={p} />)}</ProductRail>
        )}
      </section>

      {(brands.data?.length ?? 0) > 0 && (
        <section className="mt-20 overflow-hidden border-y border-line bg-white/60 py-6" aria-label="Brands">
          <div className="flex w-max animate-marquee gap-14">
            {[...(brands.data ?? []), ...(brands.data ?? [])].map((b, i) => (
              <Link key={`${b._id}-${i}`} to={`/shop?brand=${b._id}`} className="font-display text-2xl font-bold text-ink/30 transition hover:text-brand-600">{b.name}</Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
