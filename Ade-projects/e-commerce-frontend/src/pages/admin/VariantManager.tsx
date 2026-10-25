import { useEffect, useState } from 'react';
import { listVariantsForProduct, createVariant, updateVariantStock, deleteVariant } from '../../api/variants';
import type { ProductVariant } from '../../types';
import { extractErrorMessage } from '../../api/client';

export default function VariantManager({ productId }: { productId: string }) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [attrPairs, setAttrPairs] = useState([{ key: 'size', value: '' }]);
  const [images, setImages] = useState<FileList | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    listVariantsForProduct(productId)
      .then(setVariants)
      .catch((err) => setError(extractErrorMessage(err, 'Could not load variants.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, [productId]);

  const updateAttr = (i: number, field: 'key' | 'value', value: string) =>
    setAttrPairs((pairs) => pairs.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setStatus('');
    try {
      const fd = new FormData();
      fd.append('product', productId);
      fd.append('sku', sku);
      if (price) fd.append('price', price);
      fd.append('stock', stock || '0');
      const attributes: Record<string, string> = {};
      attrPairs.forEach(({ key, value }) => {
        if (key && value) attributes[key] = value;
      });
      fd.append('attributes', JSON.stringify(attributes));
      if (images) Array.from(images).forEach((img) => fd.append('images', img));

      await createVariant(fd);
      setStatus('Variant filed.');
      setSku('');
      setPrice('');
      setStock('');
      setAttrPairs([{ key: 'size', value: '' }]);
      setImages(null);
      load();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not create that variant.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStockChange = async (variantId: string, newStock: number) => {
    try {
      await updateVariantStock(variantId, newStock);
      load();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update stock.'));
    }
  };

  const handleDelete = async (variantId: string) => {
    try {
      await deleteVariant(variantId);
      load();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not remove that variant.'));
    }
  };

  return (
    <div className="border-t border-dashed border-inkfaint/30 mt-3 pt-3 space-y-4">
      {loading ? (
        <p className="label-eyebrow">Loading variants&hellip;</p>
      ) : variants.length === 0 ? (
        <p className="label-eyebrow">No variants yet.</p>
      ) : (
        <div className="space-y-2">
          {variants.map((v) => (
            <div key={v._id} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <span className="sku">{v.sku}</span>{' '}
                <span className="text-inkfaint">
                  {Object.entries(v.attributes || {})
                    .map(([k, val]) => `${k}: ${val}`)
                    .join(', ')}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={0}
                  defaultValue={v.stock}
                  onBlur={(e) => {
                    const val = Number(e.target.value);
                    if (val !== v.stock) handleStockChange(v._id, val);
                  }}
                  className="input-field !w-20 !py-1"
                />
                <button onClick={() => handleDelete(v._id)} className="label-eyebrow text-warnred hover:underline">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="grid sm:grid-cols-2 gap-2 bg-cream/50 p-3">
        <input required placeholder="Variant SKU" className="input-field !py-1.5" value={sku} onChange={(e) => setSku(e.target.value)} />
        <input
          type="number"
          step="0.01"
          placeholder="Price override (optional)"
          className="input-field !py-1.5"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          type="number"
          min={0}
          required
          placeholder="Initial stock"
          className="input-field !py-1.5"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
        <input type="file" multiple accept="image/*" onChange={(e) => setImages(e.target.files)} className="text-xs font-mono self-center" />

        {attrPairs.map((pair, i) => (
          <div key={i} className="flex gap-2 sm:col-span-2">
            <input
              placeholder="Attribute (e.g. size)"
              className="input-field !py-1.5"
              value={pair.key}
              onChange={(e) => updateAttr(i, 'key', e.target.value)}
            />
            <input
              placeholder="Value (e.g. M)"
              className="input-field !py-1.5"
              value={pair.value}
              onChange={(e) => updateAttr(i, 'value', e.target.value)}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAttrPairs((p) => [...p, { key: '', value: '' }])}
          className="label-eyebrow text-left hover:text-rust sm:col-span-2"
        >
          + Add attribute
        </button>

        {status && <p className="text-okgreen font-mono text-xs sm:col-span-2">{status}</p>}
        {error && <p className="text-warnred font-mono text-xs sm:col-span-2">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-secondary !py-1.5 sm:col-span-2">
          {submitting ? 'Adding…' : 'Add Variant'}
        </button>
      </form>
    </div>
  );
}
