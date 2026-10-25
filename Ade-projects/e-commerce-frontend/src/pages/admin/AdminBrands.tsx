import { useEffect, useState } from 'react';
import { listBrands, createBrand, deleteBrand } from '../../api/brands';
import type { Brand } from '../../types';
import { extractErrorMessage } from '../../api/client';

export default function AdminBrands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const [name, setName] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    listBrands()
      .then(setBrands)
      .catch((err) => setError(extractErrorMessage(err, 'Could not load brands.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus('');
    setError('');
    try {
      await createBrand(name, logo);
      setStatus('Brand filed.');
      setName('');
      setLogo(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not create that brand.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this brand?')) return;
    try {
      await deleteBrand(id);
      setBrands((b) => b.filter((br) => br._id !== id));
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not remove that brand.'));
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_1.4fr] gap-8">
      <form onSubmit={handleCreate} className="ticket p-6 space-y-3 h-fit">
        <h2 className="font-display text-xl uppercase mb-1">File New Brand</h2>
        <div>
          <label className="label-eyebrow block mb-1">Name</label>
          <input required className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label-eyebrow block mb-1">Logo</label>
          <input type="file" accept="image/*" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} className="text-sm font-mono" />
        </div>

        {status && <p className="text-okgreen font-mono text-sm">{status}</p>}
        {error && <p className="text-warnred font-mono text-sm">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Adding…' : 'Add Brand'}
        </button>
      </form>

      <div>
        <h2 className="font-display text-xl uppercase mb-3">Brands ({brands.length})</h2>
        {loading ? (
          <p className="label-eyebrow">Loading&hellip;</p>
        ) : (
          <div className="space-y-2">
            {brands.map((b) => (
              <div key={b._id} className="ticket p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {b.logo && <img src={b.logo} alt="" className="w-8 h-8 object-contain" />}
                  <p className="font-display uppercase">{b.name}</p>
                </div>
                <button onClick={() => handleDelete(b._id)} className="label-eyebrow text-warnred hover:underline">
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
