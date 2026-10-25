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

// Dedicated catalog page with a sidebar of filters — separate from the
// homepage's lighter "New Arrivals" showcase. Category/brand are
// single-select radios rather than checkboxes, matching what the backend's
// GET /products actually accepts (one category ID, one brand ID at a time)
// rather than faking a multi-select the API can't honor.
export default function Shop() {
  const [searchParams] = useSearchParams();

  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categorySample, setCategorySample] = useState<Product[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [query, setQuery] = useState<ProductQuery>({
    page: 1,
    limit: 15,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    category: searchParams.get('category') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  });

  useEffect(() => {
    listBrands().then(setBrands).catch(() => setBrands([]));
    listProducts({ limit: 100 })
      .then((res) => setCategorySample(res.data))
      .catch(() => setCategorySample([]));
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
    return Array.from(byId, ([id, name]) => ({ id, name }));
  }, [categorySample]);

  return (
    <div>
      <div className="bg-steel">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <h1 className="text-white text-3xl sm:text-4xl font-display font-800">Shop</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid md:grid-cols-[220px_1fr] gap-8">
        <aside className="space-y-6 h-fit">
          <div>
            <p className="label-eyebrow mb-3">Category</p>
            <div className="space-y-2">
              <FilterRadio
                checked={!query.category}
                label="All Categories"
                onChange={() => setQuery((q) => ({ ...q, category: undefined, page: 1 }))}
              />
              {categories.map((cat) => (
                <FilterRadio
                  key={cat.id}
                  checked={query.category === cat.id}
                  label={cat.name}
                  onChange={() => setQuery((q) => ({ ...q, category: cat.id, page: 1 }))}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="label-eyebrow mb-3">Brand</p>
            <div className="space-y-2">
              <FilterRadio
                checked={!query.brand}
                label="All Brands"
                onChange={() => setQuery((q) => ({ ...q, brand: undefined, page: 1 }))}
              />
              {brands.map((b) => (
                <FilterRadio
                  key={b._id}
                  checked={query.brand === b._id}
                  label={b.name}
                  onChange={() => setQuery((q) => ({ ...q, brand: b._id, page: 1 }))}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="label-eyebrow mb-3">Sort</p>
            <select
              className="input-field"
              value={`${query.sortBy}:${query.sortOrder}`}
              onChange={(e) => {
                const [sortBy, sortOrder] = e.target.value.split(':') as [string, 'asc' | 'desc'];
                setQuery((q) => ({ ...q, sortBy, sortOrder, page: 1 }));
              }}
            >
              <option value="createdAt:desc">Newest</option>
              <option value="price:asc">Price: low to high</option>
              <option value="price:desc">Price: high to low</option>
              <option value="name:asc">Name: A&ndash;Z</option>
            </select>
          </div>
        </aside>

        <div>
          {error && <p className="text-warnred text-sm mb-4">{error}</p>}
          {loading ? (
            <p className="label-eyebrow">Loading products…</p>
          ) : products.length === 0 ? (
            <div className="ticket p-10 text-center">
              <p className="label-eyebrow">No products match these filters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
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
        </div>
      </div>
    </div>
  );
}

function FilterRadio({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="radio" checked={checked} onChange={onChange} className="accent-rust" />
      <span className={checked ? 'text-rust font-medium' : 'text-ink'}>{label}</span>
    </label>
  );
}
