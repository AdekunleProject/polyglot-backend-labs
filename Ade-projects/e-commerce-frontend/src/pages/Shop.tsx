import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LuCamera, LuSearch, LuSlidersHorizontal, LuX } from 'react-icons/lu';
import { visualSearch, type SimilarProduct } from '../api/reviews';
import { errorMessage } from '../api/client';
import { signatureFromSource } from '../lib/visual';
import { listBrands, listCategories, listProducts, type ProductQuery } from '../api/catalog';
import { Alert, EmptyState, ErrorState, Modal, Pager, Spinner, useAsync } from '../components/ui';
import { ProductCard, ProductRail, ProductGridSkeleton } from '../components/ProductCard';

const SORTS: { label: string; sortBy: NonNullable<ProductQuery['sortBy']>; sortOrder: 'asc' | 'desc' }[] = [
  { label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'Price: low to high', sortBy: 'price', sortOrder: 'asc' },
  { label: 'Price: high to low', sortBy: 'price', sortOrder: 'desc' },
  { label: 'Name: A to Z', sortBy: 'name', sortOrder: 'asc' },
];

export default function Shop() {
  const [sp, setSp] = useSearchParams();
  const get = (k: string) => sp.get(k) ?? '';
  const page = Number(get('page')) || 1;
  const sortIdx = Math.max(0, SORTS.findIndex((s) => `${s.sortBy}:${s.sortOrder}` === get('sort')));
  const [search, setSearch] = useState(get('search'));
  const [min, setMin] = useState(get('min'));
  const [max, setMax] = useState(get('max'));
  const [filters, setFilters] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; results: SimilarProduct[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [photoErr, setPhotoErr] = useState('');

  const searchByPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setPhotoErr('Choose a photo (JPG, PNG or WebP).'); return; }
    setSearching(true); setPhotoErr('');
    try {
      const signature = await signatureFromSource(file);
      const results = await visualSearch(signature);
      setPhoto((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(file), results }; });
    } catch (e) { setPhotoErr(errorMessage(e)); } finally { setSearching(false); }
  };
  const clearPhoto = () => { if (photo) URL.revokeObjectURL(photo.url); setPhoto(null); setPhotoErr(''); };

  useEffect(() => { setSearch(get('search')); setMin(get('min')); setMax(get('max')); }, [sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = useAsync(listCategories, []);
  const brands = useAsync(listBrands, []);
  const query: ProductQuery = {
    search: get('search') || undefined, category: get('category') || undefined, brand: get('brand') || undefined,
    minPrice: get('min') ? Number(get('min')) : undefined, maxPrice: get('max') ? Number(get('max')) : undefined,
    featured: get('featured') === 'true' ? true : undefined, page, limit: 12, sortBy: SORTS[sortIdx].sortBy, sortOrder: SORTS[sortIdx].sortOrder,
  };
  const products = useAsync(() => listProducts(query), [sp.toString()]);

  const patch = (changes: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(sp);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (resetPage) next.delete('page');
    setSp(next);
  };
  const clearAll = () => { setSp(new URLSearchParams()); setFilters(false); };
  const active = ['search', 'category', 'brand', 'min', 'max', 'featured'].filter((k) => get(k));
  const catName = (id: string) => cats.data?.find((c) => c._id === id)?.name ?? 'Category';
  const brandName = (id: string) => brands.data?.find((b) => b._id === id)?.name ?? 'Brand';

  const panel = (
    <div className="space-y-7">
      <div>
        <h3 className="label">Category</h3>
        <div className="mt-2 flex flex-col gap-0.5">
          <button onClick={() => patch({ category: undefined })} className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${!get('category') ? 'bg-brand-50 text-brand-700' : 'hover:bg-brand-50/60'}`}>All categories</button>
          {(cats.data ?? []).map((c) => (
            <button key={c._id} onClick={() => patch({ category: c._id })} className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition ${get('category') === c._id ? 'bg-brand-50 text-brand-700' : 'hover:bg-brand-50/60'}`}>{c.name}</button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="label">Brand</h3>
        <select className="field" value={get('brand')} onChange={(e) => patch({ brand: e.target.value || undefined })} aria-label="Brand">
          <option value="">All brands</option>
          {(brands.data ?? []).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
      </div>
      <div>
        <h3 className="label">Price (₦)</h3>
        <div className="flex items-center gap-2">
          <input className="field" inputMode="numeric" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} aria-label="Minimum price" />
          <span className="text-mute">–</span>
          <input className="field" inputMode="numeric" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} aria-label="Maximum price" />
        </div>
        <button className="btn-ghost btn-sm mt-2 w-full" onClick={() => { patch({ min: min || undefined, max: max || undefined }); setFilters(false); }}>Apply price</button>
      </div>
      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={get('featured') === 'true'} onChange={(e) => patch({ featured: e.target.checked ? 'true' : undefined })} /> Featured only
      </label>
    </div>
  );

  return (
    <div className="container-x py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Harlim ShopAll</p>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">{get('search') ? `Results for “${get('search')}”` : 'Shop everything'}</h1>
          {products.data && <p className="mt-1 text-sm text-mute">{products.data.meta.total} product{products.data.meta.total === 1 ? '' : 's'}</p>}
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <form className="relative flex-1 sm:w-64" onSubmit={(e) => { e.preventDefault(); patch({ search: search.trim() || undefined }); }} role="search">
            <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
            <input className="field pl-10! pr-11!" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
            <label className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-brand-600 transition hover:bg-brand-50 focus-within:ring-2 focus-within:ring-brand-300" title="Search with a photo">
              {searching ? <Spinner /> : <LuCamera />}
              <input type="file" accept="image/*" className="sr-only" aria-label="Search with a photo" onChange={(e) => { void searchByPhoto(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </form>
          <select className="field w-auto" aria-label="Sort" value={sortIdx} onChange={(e) => patch({ sort: `${SORTS[+e.target.value].sortBy}:${SORTS[+e.target.value].sortOrder}` })}>
            {SORTS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
          </select>
          <button className="btn-ghost lg:hidden" onClick={() => setFilters(true)} aria-label="Filters"><LuSlidersHorizontal /></button>
        </div>
      </div>

      {photoErr && <div className="mb-5"><Alert>{photoErr}</Alert></div>}
      {photo && (
        <section className="card mb-8 overflow-hidden" aria-label="Visual search results">
          <div className="flex flex-wrap items-center gap-4 border-b border-line bg-brand-50/60 p-4">
            <img src={photo.url} alt="Your photo" className="h-16 w-16 rounded-xl object-cover ring-2 ring-white" />
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold">Looks like your photo</p>
              <p className="text-sm text-mute">Matched by colour and layout. Products without a photo match are not listed.</p>
            </div>
            <button className="btn-ghost btn-sm" onClick={clearPhoto}><LuX /> Clear photo</button>
          </div>
          {photo.results.length === 0 ? (
            <p className="p-6 text-sm text-mute">No products with photos to compare yet.</p>
          ) : (
            <div className="p-4">
              <ProductRail>
                {photo.results.slice(0, 12).map((p) => (
                  <div key={p._id} className="relative h-full">
                    <span className="absolute right-2 top-2 z-10 rounded-full bg-night-900/85 px-2 py-0.5 text-[11px] font-bold text-gold-300 backdrop-blur">{p.similarity}% match</span>
                    <ProductCard product={p} />
                  </div>
                ))}
              </ProductRail>
            </div>
          )}
        </section>
      )}

      {active.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {get('category') && <Chip onClear={() => patch({ category: undefined })}>{catName(get('category'))}</Chip>}
          {get('brand') && <Chip onClear={() => patch({ brand: undefined })}>{brandName(get('brand'))}</Chip>}
          {get('featured') && <Chip onClear={() => patch({ featured: undefined })}>Featured</Chip>}
          {(get('min') || get('max')) && <Chip onClear={() => patch({ min: undefined, max: undefined })}>₦{get('min') || '0'} – {get('max') ? `₦${get('max')}` : 'any'}</Chip>}
          {get('search') && <Chip onClear={() => { patch({ search: undefined }); }}>“{get('search')}”</Chip>}
          <button onClick={clearAll} className="text-xs font-semibold text-brand-600 hover:underline">Clear all</button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
        <aside className="card-pad hidden h-fit lg:sticky lg:top-24 lg:block">{panel}</aside>
        <div>
          {products.loading ? <ProductGridSkeleton n={8} /> : products.error ? <ErrorState error={products.error} onRetry={products.reload} /> : products.data!.data.length === 0 ? (
            <EmptyState icon={<LuSearch />} title="Nothing matched" text="Try a different search or remove some filters." action={<button className="btn-primary" onClick={clearAll}>Clear filters</button>} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3">{products.data!.data.map((p) => <ProductCard key={p._id} product={p} />)}</div>
              <Pager page={products.data!.meta.page} pages={products.data!.meta.totalPages} onChange={(n) => { patch({ page: n > 1 ? String(n) : undefined }, false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
            </>
          )}
        </div>
      </div>

      <Modal open={filters} onClose={() => setFilters(false)} title="Filters">{panel}</Modal>
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">{children}<button onClick={onClear} aria-label="Remove filter" className="grid h-5 w-5 place-items-center rounded-full hover:bg-brand-100"><LuX /></button></span>;
}
