import { useState, type FormEvent } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';
import * as cat from '../../api/catalog';
import { errorMessage } from '../../api/client';
import { ErrorState, PageLoader, useAsync } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import type { Brand, Category } from '../../types';
import { PageHead } from './AdminLayout';

function Column({ title, items, onAdd, onRemove }: { title: string; items: (Brand | Category)[]; onAdd: (name: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); if (!name.trim()) return; setBusy(true); try { await onAdd(name.trim()); setName(''); } finally { setBusy(false); } };
  return (
    <div className="card-pad">
      <h2 className="font-display text-lg font-bold">{title} <span className="text-sm font-medium text-mute">({items.length})</span></h2>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input className="field" placeholder={`New ${title.toLowerCase().replace(/s$/, '').replace('categorie', 'category')} name`} value={name} onChange={(e) => setName(e.target.value)} aria-label={`New ${title} name`} />
        <button className="btn-primary" disabled={busy}><LuPlus /> Add</button>
      </form>
      <ul className="mt-4 divide-y divide-line">
        {items.map((i) => (
          <li key={i._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-medium">{i.name}</span>
            <button className="text-rose-600 hover:text-rose-700" aria-label={`Delete ${i.name}`} onClick={() => onRemove(i._id)}><LuTrash2 /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Taxonomy() {
  const toast = useToast();
  const d = useAsync(async () => ({ brands: await cat.listBrands(), categories: await cat.listCategories() }), []);
  if (d.loading && !d.data) return <PageLoader />;
  if (d.error || !d.data) return <ErrorState error={d.error} onRetry={d.reload} />;
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); d.reload(); } catch (e) { toast.error(errorMessage(e)); } };
  return (
    <div>
      <PageHead title="Brands & categories" sub="These power the filters and menus in the store." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Column title="Brands" items={d.data.brands} onAdd={(n) => run(() => cat.createBrand(n), 'Brand added')} onRemove={(id) => run(() => cat.deleteBrand(id), 'Brand deleted')} />
        <Column title="Categories" items={d.data.categories} onAdd={(n) => run(() => cat.createCategory(n), 'Category added')} onRemove={(id) => run(() => cat.deleteCategory(id), 'Category deleted')} />
      </div>
    </div>
  );
}
