import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProduct } from '../../api/products';
import { listBrands } from '../../api/brands';
import { listCategories } from '../../api/categories';
import type { Brand, Category } from '../../types';
import { extractErrorMessage } from '../../api/client';

export default function AdminAddProduct() {
  const navigate = useNavigate();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ name: '', sku: '', price: '', description: '', brand: '', category: '' });
  const [images, setImages] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    listBrands().then(setBrands).catch(() => setBrands([]));
    listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const update =
    (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus('');
    setError('');
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('sku', form.sku);
      fd.append('price', form.price);
      fd.append('category', form.category);
      if (form.description) fd.append('description', form.description);
      if (form.brand) fd.append('brand', form.brand);
      if (images) Array.from(images).forEach((img) => fd.append('images', img));
      await createProduct(fd);
      setStatus('Product added to catalog.');
      setForm({ name: '', sku: '', price: '', description: '', brand: '', category: '' });
      setImages(null);
      setTimeout(() => navigate('/admin/products'), 1200);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not create that product.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h2 className="font-display text-xl font-700 mb-4">Add Product</h2>
      <form onSubmit={handleSubmit} className="ticket p-6 space-y-4">
        <div>
          <label className="label-eyebrow block mb-1">Name</label>
          <input required className="input-field" value={form.name} onChange={update('name')} />
        </div>
        <div>
          <label className="label-eyebrow block mb-1">SKU</label>
          <input required className="input-field" value={form.sku} onChange={update('sku')} />
        </div>
        <div>
          <label className="label-eyebrow block mb-1">Price (USD)</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            className="input-field"
            value={form.price}
            onChange={update('price')}
          />
        </div>
        <div>
          <label className="label-eyebrow block mb-1">Category</label>
          <select required className="input-field" value={form.category} onChange={update('category')}>
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-eyebrow block mb-1">Brand</label>
          <select className="input-field" value={form.brand} onChange={update('brand')}>
            <option value="">None</option>
            {brands.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label-eyebrow block mb-1">Description</label>
          <textarea className="input-field" rows={3} value={form.description} onChange={update('description')} />
        </div>
        <div>
          <label className="label-eyebrow block mb-1">Images</label>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setImages(e.target.files)}
            className="text-sm"
          />
        </div>

        {status && <p className="text-okgreen text-sm">{status}</p>}
        {error && <p className="text-warnred text-sm">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Adding…' : 'Add Product'}
        </button>
      </form>
      <p className="text-xs text-inkfaint mt-3">
        Variants (size, color, stock) are managed after creation from the Product List page.
      </p>
    </div>
  );
}
