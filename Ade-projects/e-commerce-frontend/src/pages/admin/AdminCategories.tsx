import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProducts } from '../../api/products';
import type { Category, Product } from '../../types';
import { extractErrorMessage } from '../../api/client';

// The backend has no dedicated /categories endpoint (no controller exists
// for it), only Product.category as a populated reference — so this view
// is a real breakdown derived from actual products rather than a CRUD
// screen against an endpoint that doesn't exist.
export default function AdminCategories() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listProducts({ limit: 200 })
      .then((res) => setProducts(res.data))
      .catch((err) => setError(extractErrorMessage(err, 'Could not load products.')))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const byId = new Map<string, { name: string; count: number; sampleImage?: string }>();
    products.forEach((p) => {
      if (!p.category || typeof p.category !== 'object') return;
      const cat = p.category as Category;
      const existing = byId.get(cat._id);
      if (existing) {
        existing.count += 1;
      } else {
        byId.set(cat._id, { name: cat.name, count: 1, sampleImage: p.images?.[0] });
      }
    });
    return Array.from(byId, ([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count);
  }, [products]);

  const uncategorized = products.filter((p) => !p.category).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-700">Categories ({categories.length})</h2>
        <p className="label-eyebrow">From {products.length} sampled products</p>
      </div>

      {error && <p className="text-warnred text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="label-eyebrow">Loading…</p>
      ) : categories.length === 0 ? (
        <div className="ticket p-10 text-center">
          <p className="label-eyebrow">No products have a category assigned yet.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/shop?category=${cat.id}`}
              className="ticket p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
            >
              <div className="w-14 h-14 rounded-lg bg-manila overflow-hidden shrink-0">
                {cat.sampleImage && <img src={cat.sampleImage} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="font-display font-600 truncate">{cat.name}</p>
                <p className="label-eyebrow">
                  {cat.count} product{cat.count !== 1 ? 's' : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && uncategorized > 0 && (
        <p className="label-eyebrow mt-4">{uncategorized} sampled product(s) have no category assigned.</p>
      )}

      <p className="text-xs text-inkfaint mt-6">
        There's no categories management endpoint on the backend yet — this counts real products by their assigned
        category rather than offering create/edit here. Add a categories controller if you want CRUD for this.
      </p>
    </div>
  );
}
