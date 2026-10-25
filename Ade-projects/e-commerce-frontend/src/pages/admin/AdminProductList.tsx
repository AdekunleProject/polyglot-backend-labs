import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProducts, updateProduct, deleteProduct } from '../../api/products';
import type { Product } from '../../types';
import { extractErrorMessage } from '../../api/client';
import VariantManager from './VariantManager';

export default function AdminProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; price: string; description: string } | null>(
    null
  );

  const load = () => {
    setLoading(true);
    listProducts({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' })
      .then((res) => setProducts(res.data))
      .catch((err) => setError(extractErrorMessage(err, 'Could not load products.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (productId: string) => {
    if (!confirm('Remove this product from the catalog?')) return;
    try {
      await deleteProduct(productId);
      setProducts((ps) => ps.filter((p) => p._id !== productId));
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not remove that product.'));
    }
  };

  const startEdit = (p: Product) =>
    setEditing({ id: p._id, name: p.name, price: String(p.price), description: p.description ?? '' });

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await updateProduct(editing.id, {
        name: editing.name,
        price: Number(editing.price),
        description: editing.description,
      });
      setEditing(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not save changes.'));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-700">Product List ({products.length})</h2>
        <Link to="/admin/products/new" className="btn-primary !py-2 !px-4 !text-xs">
          + Add Product
        </Link>
      </div>

      {error && <p className="text-warnred text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="label-eyebrow">Loading&hellip;</p>
      ) : products.length === 0 ? (
        <div className="ticket p-10 text-center">
          <p className="label-eyebrow mb-4">No products yet.</p>
          <Link to="/admin/products/new" className="btn-primary inline-block">
            Add Your First Product
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <div key={p._id} className="ticket p-4">
              {editing?.id === p._id ? (
                <div className="space-y-2">
                  <input
                    className="input-field"
                    value={editing.name}
                    onChange={(e) => setEditing((ed) => ed && { ...ed, name: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    className="input-field"
                    value={editing.price}
                    onChange={(e) => setEditing((ed) => ed && { ...ed, price: e.target.value })}
                  />
                  <textarea
                    rows={2}
                    className="input-field"
                    value={editing.description}
                    onChange={(e) => setEditing((ed) => ed && { ...ed, description: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="btn-primary !py-1.5 !text-xs">
                      Save
                    </button>
                    <button onClick={() => setEditing(null)} className="btn-secondary !py-1.5 !text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display font-600 truncate">{p.name}</p>
                    <p className="sku">{p.sku}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <span className="font-medium">${p.price.toFixed(2)}</span>
                    <button onClick={() => startEdit(p)} className="label-eyebrow hover:text-rust">
                      Edit
                    </button>
                    <button
                      onClick={() => setExpanded(expanded === p._id ? null : p._id)}
                      className="label-eyebrow hover:text-rust"
                    >
                      {expanded === p._id ? 'Hide Variants' : 'Variants'}
                    </button>
                    <button onClick={() => handleDelete(p._id)} className="label-eyebrow text-warnred hover:underline">
                      Remove
                    </button>
                  </div>
                </div>
              )}

              {expanded === p._id && editing?.id !== p._id && <VariantManager productId={p._id} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
