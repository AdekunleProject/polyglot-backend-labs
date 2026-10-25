import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listProducts, ProductQuery } from '../api/products';
import { listBrands } from '../api/brands';
import type { Brand, Category, Product } from '../types';
import ProductCard from '../components/ProductCard';
import { extractErrorMessage } from '../api/client';

function categoryInfo(c: Product['category']): { id: string; name: string } | null {
  if (!c || typeof c !== 'object') return null;
  const cat = c as Category;
  return { id: cat._id, name: cat.name };
}

export default function Home() {
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') ?? undefined;

  const [products, setProducts] = useState<Product[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categorySample, setCategorySample] = useState<Product[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState<ProductQuery>({
    page: 1,
    limit: 16,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    search: initialSearch,
  });
  const [searchInput, setSearchInput] = useState(initialSearch ?? '');

  // Backend has no dedicated categories endpoint, so the category strip is
  // derived from a larger sample of real products rather than a separate call.
  useEffect(() => {
    listBrands().then(setBrands).catch(() => setBrands([]));
    listProducts({ limit: 60, sortBy: 'createdAt', sortOrder: 'desc' })
      .then((res) => setCategorySample(res.data))
      .catch(() => setCategorySample([]));
    listProducts({ featured: true, limit: 10 })
      .then((res) => setFeatured(res.data))
      .catch(() => setFeatured([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    listProducts(query)
      .then((res) => {
        setProducts(res.data);
        setTotalPages(res.meta?.totalPages ?? 1);
      })
      .catch((err) => setError(extractErrorMessage(err, 'Could not load products.')))
      .finally(() => setLoading(false));
  }, [query]);

  const categories = useMemo(() => {
    const byId = new Map<string, string>();
    categorySample.forEach((p) => {
      const info = categoryInfo(p.category);
      if (info) byId.set(info.id, info.name);
    });
    return Array.from(byId, ([id, name]) => ({ id, name })).slice(0, 10);
  }, [categorySample]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery((q) => ({ ...q, search: searchInput || undefined, page: 1 }));
  };

  return (
    <div>
      {/* Hero */}
      <section className="bg-steel">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <p className="text-rust font-display font-semibold text-sm uppercase tracking-wide mb-2">
              Everything, one cart
            </p>
            <h1 className="text-white text-4xl sm:text-5xl font-display font-800 leading-tight mb-4">
              Order anything.
              <br />
              Delivered to your door.
            </h1>
            <p className="text-white/70 text-sm sm:text-base mb-6 max-w-md">
              Browse thousands of products across every category, pay by card or bank transfer, and track it all
              from one dashboard.
            </p>
            <a href="#browse" className="btn-primary inline-block">
              Start Shopping
            </a>
          </div>
          <div className="hidden md:grid grid-cols-3 gap-3">
            {categories.slice(0, 6).map((cat) => (
              <div
                key={cat.id}
                className="bg-white/10 rounded-xl p-4 text-white text-sm font-display font-semibold text-center flex items-center justify-center h-20"
              >
                {cat.name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Category strip */}
      {categories.length > 0 && (
        <section className="border-b border-black/5 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setQuery((q) => ({ ...q, category: undefined, page: 1 }))}
              className={`whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
                !query.category ? 'border-rust text-rust' : 'border-black/10 hover:border-rust hover:text-rust'
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setQuery((q) => ({ ...q, category: cat.id, page: 1 }))}
                className={`whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  query.category === cat.id ? 'border-rust text-rust' : 'border-black/10 hover:border-rust hover:text-rust'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Featured picks */}
        {featured.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-display font-700">Top Picks</h2>
              <span className="label-eyebrow text-rust">Featured</span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {featured.map((p) => (
                <div key={p._id} className="w-40 sm:w-48 shrink-0">
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Filters + grid */}
        <section id="browse">
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2">
              <input
                className="input-field"
                placeholder="Search products…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              <button type="submit" className="btn-secondary whitespace-nowrap">
                Search
              </button>
            </form>

            <select
              className="input-field md:w-52"
              value={query.brand ?? ''}
              onChange={(e) => setQuery((q) => ({ ...q, brand: e.target.value || undefined, page: 1 }))}
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              className="input-field md:w-52"
              value={`${query.sortBy}:${query.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split(':') as [string, 'asc' | 'desc'];
                setQuery((q) => ({ ...q, sortBy, sortOrder, page: 1 }));
              }}
            >
              <option value="createdAt:desc">Newest arrivals</option>
              <option value="price:asc">Price: low to high</option>
              <option value="price:desc">Price: high to low</option>
              <option value="name:asc">Name: A&ndash;Z</option>
            </select>
          </div>

          {error && <p className="text-warnred text-sm mb-6">{error}</p>}

          {loading ? (
            <p className="label-eyebrow">Loading products…</p>
          ) : products.length === 0 ? (
            <div className="ticket p-10 text-center">
              <p className="label-eyebrow">No products match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {products.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-10">
              <button
                className="btn-secondary !px-4 !py-2"
                disabled={(query.page ?? 1) <= 1}
                onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) - 1 }))}
              >
                Prev
              </button>
              <span className="text-sm font-medium">
                {query.page} / {totalPages}
              </span>
              <button
                className="btn-secondary !px-4 !py-2"
                disabled={(query.page ?? 1) >= totalPages}
                onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
              >
                Next
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
