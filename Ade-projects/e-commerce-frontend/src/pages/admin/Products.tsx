import { useEffect, useState, type FormEvent } from 'react';
import { LuBoxes, LuLayers, LuPencil, LuPlus, LuSearch, LuTrash2, LuX } from 'react-icons/lu';
import { signatureFromSource } from '../../lib/visual';
import * as cat from '../../api/catalog';
import { errorMessage } from '../../api/client';
import { ProductImage } from '../../components/ProductCard';
import { Alert, EmptyState, ErrorState, Field, Modal, PageLoader, Pager, StatusBadge, useAsync } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { idOf, money, nameOf } from '../../lib/format';
import type { Brand, Category, Product, Variant } from '../../types';
import { PageHead } from './AdminLayout';

const LIMIT = 10;

export default function Products() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [managing, setManaging] = useState<Product | null>(null);
  const [removing, setRemoving] = useState<Product | null>(null);
  useEffect(() => { const t = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const list = useAsync(() => cat.listProducts({ search: q || undefined, page, limit: LIMIT, sortBy: 'createdAt', sortOrder: 'desc' }), [q, page]);
  const taxo = useAsync(async () => ({ brands: await cat.listBrands(), categories: await cat.listCategories() }), []);

  const confirmDelete = async () => {
    if (!removing) return;
    try { await cat.deleteProduct(removing._id); toast.success(`${removing.name} was deleted`); setRemoving(null); list.reload(); }
    catch (e) { toast.error(errorMessage(e)); }
  };

  return (
    <div>
      <PageHead title="Products" sub="Create, edit and stock the catalogue. Changes are recorded in the audit log."
        action={<button className="btn-primary" onClick={() => setEditing('new')}><LuPlus /> New product</button>} />
      <div className="relative mb-4 max-w-md">
        <LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" />
        <input className="field pl-10" placeholder="Search by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search products" />
      </div>
      {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data?.data.length ? (
        <EmptyState icon={<LuBoxes />} title="No products found" text="Try another search, or add your first product." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]">
            <thead className="border-b border-line bg-paper"><tr><th className="table-th">Product</th><th className="table-th">SKU</th><th className="table-th">Category</th><th className="table-th">Price</th><th className="table-th">Status</th><th className="table-th text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.data.data.map((p) => (
                <tr key={p._id} className="hover:bg-paper/60">
                  <td className="table-td"><div className="flex items-center gap-3"><ProductImage product={p} className="h-12 w-12 rounded-xl" /><div className="min-w-0"><p className="truncate font-semibold">{p.name}</p><p className="text-xs text-mute">{nameOf(p.brand)}</p></div></div></td>
                  <td className="table-td font-mono text-xs text-mute">{p.sku}</td>
                  <td className="table-td">{nameOf(p.category) || '—'}</td>
                  <td className="table-td font-semibold">{money(p.price)}</td>
                  <td className="table-td"><div className="flex gap-1.5"><StatusBadge tone={p.isActive ? 'green' : 'gray'}>{p.isActive ? 'Active' : 'Hidden'}</StatusBadge>{p.featured && <StatusBadge tone="violet">Featured</StatusBadge>}</div></td>
                  <td className="table-td"><div className="flex justify-end gap-1.5">
                    <button className="btn-ghost btn-sm" onClick={() => setManaging(p)}><LuLayers /> Variants</button>
                    <button className="btn-ghost btn-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><LuPencil /></button>
                    <button className="btn-ghost btn-sm text-rose-600" aria-label={`Delete ${p.name}`} onClick={() => setRemoving(p)}><LuTrash2 /></button>
                  </div></td>
                </tr>
              ))}
            </tbody></table></div>
        </div>
      )}
      <Pager page={page} pages={list.data?.meta.totalPages ?? 1} onChange={setPage} />

      {editing && <ProductForm product={editing === 'new' ? null : editing} brands={taxo.data?.brands ?? []} categories={taxo.data?.categories ?? []}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
      {managing && <Variants product={managing} onClose={() => setManaging(null)} />}
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete this product?">
        <p className="text-sm text-mute">{removing?.name} and its variants will be removed from the store. Existing orders keep their own copy of the details.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setRemoving(null)}>Cancel</button><button className="btn-danger" onClick={confirmDelete}>Delete product</button></div>
      </Modal>
    </div>
  );
}

function ProductForm({ product, brands, categories, onClose, onSaved }: { product: Product | null; brands: Brand[]; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: product?.name ?? '', sku: product?.sku ?? '', price: String(product?.price ?? ''), description: product?.description ?? '',
    category: idOf(product?.category as Category | string | undefined), brand: idOf(product?.brand as Brand | string | undefined), featured: !!product?.featured, isActive: product?.isActive ?? true });
  const [files, setFiles] = useState<File[]>([]);
  const [photos, setPhotos] = useState<string[]>(product?.images ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!f.name.trim() || !f.sku.trim() || !(Number(f.price) > 0) || !f.category || !f.brand || !f.description.trim()) { setErr('Name, SKU, price, category, brand and description are all required.'); return; }
    setBusy(true);
    try {
      if (product) {
        await cat.updateProduct(product._id, { name: f.name.trim(), sku: f.sku.trim(), price: Number(f.price), description: f.description.trim(), category: f.category, brand: f.brand, featured: f.featured, isActive: f.isActive });
        if (files.length) {
          const fd = new FormData();
          files.forEach((file) => fd.append('images', file));
          if (!photos.length) { try { fd.append('visualSignature', JSON.stringify(await signatureFromSource(files[0]))); } catch { /* photos are still added */ } }
          await cat.addProductImages(product._id, fd);
        }
        toast.success('Product updated');
      } else {
        const fd = new FormData();
        fd.append('name', f.name.trim()); fd.append('sku', f.sku.trim()); fd.append('price', f.price); fd.append('description', f.description.trim());
        fd.append('category', f.category); fd.append('brand', f.brand); fd.append('featured', String(f.featured));
        files.forEach((file) => fd.append('images', file));
        if (files.length) { try { fd.append('visualSignature', JSON.stringify(await signatureFromSource(files[0]))); } catch { /* the product is still created without a visual signature */ } }
        await cat.createProduct(fd);
        toast.success('Product created. Add variants to make it purchasable.');
      }
      onSaved();
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={product ? 'Edit product' : 'New product'} wide>
      <form onSubmit={submit} className="space-y-4">
        {err && <Alert>{err}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><input className="field" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="SKU"><input className="field font-mono" value={f.sku} onChange={(e) => set('sku', e.target.value)} placeholder="HSA-1042" /></Field>
          <Field label="Price (₦)" hint="Used when a variant has no price of its own."><input className="field" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value.replace(/[^\d.]/g, ''))} /></Field>
          <Field label="Category"><select className="field" value={f.category} onChange={(e) => set('category', e.target.value)}><option value="">Choose…</option>{categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}</select></Field>
          <Field label="Brand"><select className="field" value={f.brand} onChange={(e) => set('brand', e.target.value)}><option value="">Choose…</option>{brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select></Field>
          <Field label={product ? 'Add photos' : 'Photos'} hint={`Up to 10 images in total.`}><input type="file" accept="image/*" multiple className="field file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 10))} /></Field>
        </div>
        {product && photos.length > 0 && (
          <div>
            <p className="label">Current photos</p>
            <div className="flex flex-wrap gap-3">
              {photos.map((url) => (
                <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl border border-line">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button type="button" aria-label="Remove photo" className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white hover:bg-rose-600"
                    onClick={async () => { try { const updated = await cat.removeProductImage(product._id, url); setPhotos(updated.images ?? photos.filter((x) => x !== url)); } catch (e3) { setErr(errorMessage(e3)); } }}><LuX size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        <Field label="Description"><textarea className="field min-h-24" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="flex flex-wrap gap-6 text-sm font-medium">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.featured} onChange={(e) => set('featured', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Featured on the home page</label>
          {product && <label className="flex items-center gap-2"><input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} className="h-4 w-4 accent-brand-600" /> Visible in the store</label>}
        </div>
        <div className="flex justify-end gap-2 pt-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : product ? 'Save changes' : 'Create product'}</button></div>
      </form>
    </Modal>
  );
}

function Variants({ product, onClose }: { product: Product; onClose: () => void }) {
  const toast = useToast();
  const list = useAsync(() => cat.listVariants(product._id), [product._id]);
  const [adding, setAdding] = useState(false);
  const [stock, setStock] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ sku: '', price: '', stock: '', attrs: '' });
  const [err, setErr] = useState('');

  const saveStock = async (v: Variant) => {
    const n = Number(stock[v._id]);
    if (!Number.isInteger(n) || n < 0) { toast.error('Stock must be a whole number, zero or more.'); return; }
    try { await cat.updateStock(v._id, n); toast.success('Stock updated'); setStock((s) => { const c = { ...s }; delete c[v._id]; return c; }); list.reload(); }
    catch (e) { toast.error(errorMessage(e)); }
  };
  const remove = async (v: Variant) => { try { await cat.deleteVariant(v._id); toast.success('Variant removed'); list.reload(); } catch (e) { toast.error(errorMessage(e)); } };
  const create = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    const attributes: Record<string, string> = {};
    for (const part of form.attrs.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [k, ...rest] = part.split(':');
      if (!k || !rest.length) { setErr('Write attributes like  Colour: Black, Size: M'); return; }
      attributes[k.trim()] = rest.join(':').trim();
    }
    if (!form.sku.trim() || !Object.keys(attributes).length || form.stock === '') { setErr('SKU, stock and at least one attribute are required.'); return; }
    const fd = new FormData();
    fd.append('product', product._id); fd.append('sku', form.sku.trim()); fd.append('stock', form.stock);
    if (form.price) fd.append('price', form.price);
    fd.append('attributes', JSON.stringify(attributes));
    try { await cat.createVariant(fd); toast.success('Variant added'); setForm({ sku: '', price: '', stock: '', attrs: '' }); setAdding(false); list.reload(); }
    catch (e2) { setErr(errorMessage(e2)); }
  };

  return (
    <Modal open onClose={onClose} title={`Variants · ${product.name}`} wide>
      {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <div className="space-y-3">
          {(list.data ?? []).length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">This product has no variants yet, so customers cannot buy it.</p>}
          {(list.data ?? []).map((v) => (
            <div key={v._id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(' · ')}</p><p className="font-mono text-xs text-mute">{v.sku} · {v.price && v.price > 0 ? money(v.price) : 'Product price'}</p></div>
              <input aria-label={`Stock for ${v.sku}`} className="field w-24 py-2" inputMode="numeric" value={stock[v._id] ?? String(v.stock)} onChange={(e) => setStock((s) => ({ ...s, [v._id]: e.target.value.replace(/\D/g, '') }))} />
              {stock[v._id] !== undefined && stock[v._id] !== String(v.stock) && <button className="btn-primary btn-sm" onClick={() => saveStock(v)}>Save</button>}
              <StatusBadge tone={v.stock === 0 ? 'red' : v.stock <= 10 ? 'amber' : 'green'}>{v.stock === 0 ? 'Out' : v.stock <= 10 ? 'Low' : 'In stock'}</StatusBadge>
              <button className="text-rose-600" aria-label={`Delete ${v.sku}`} onClick={() => remove(v)}><LuTrash2 /></button>
            </div>
          ))}
          {adding ? (
            <form onSubmit={create} className="space-y-3 rounded-xl bg-paper p-4">
              {err && <Alert>{err}</Alert>}
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="SKU"><input className="field font-mono" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
                <Field label="Stock"><input className="field" inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, '') })} /></Field>
                <Field label="Price (₦)" hint="Optional"><input className="field" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
              </div>
              <Field label="Attributes" hint="Comma separated, like  Colour: Black, Size: M"><input className="field" value={form.attrs} onChange={(e) => setForm({ ...form, attrs: e.target.value })} /></Field>
              <div className="flex justify-end gap-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button><button className="btn-primary btn-sm">Add variant</button></div>
            </form>
          ) : <button className="btn-ghost w-full" onClick={() => setAdding(true)}><LuPlus /> Add a variant</button>}
        </div>
      )}
    </Modal>
  );
}
