import type { ProductVariant } from '../types';

interface Props {
  variants: ProductVariant[];
  selected: ProductVariant | null;
  onSelect: (variant: ProductVariant) => void;
}

// Groups variant attributes (e.g. { size: 'M', color: 'Black' }) into
// per-attribute-key choice rows.
export default function VariantPicker({ variants, selected, onSelect }: Props) {
  if (!variants.length) {
    return <p className="label-eyebrow">No variants configured for this item.</p>;
  }

  const attributeKeys = Array.from(
    new Set(variants.flatMap((v) => Object.keys(v.attributes || {})))
  );

  return (
    <div className="space-y-4">
      {attributeKeys.map((key) => {
        const values = Array.from(new Set(variants.map((v) => v.attributes?.[key]).filter(Boolean)));
        return (
          <div key={key}>
            <p className="label-eyebrow mb-2">{key}</p>
            <div className="flex flex-wrap gap-2">
              {values.map((value) => {
                const matchingVariant = variants.find((v) => v.attributes?.[key] === value && v.stock > 0);
                const isSelected = selected?.attributes?.[key] === value;
                const outOfStock = !matchingVariant;
                return (
                  <button
                    key={value}
                    disabled={outOfStock}
                    onClick={() => matchingVariant && onSelect(matchingVariant)}
                    className={`font-mono text-sm px-3 py-1.5 border transition-colors ${
                      isSelected
                        ? 'bg-ink text-cream border-ink'
                        : outOfStock
                        ? 'border-inkfaint/30 text-inkfaint/50 line-through cursor-not-allowed'
                        : 'border-ink hover:bg-ink hover:text-cream'
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {selected && (
        <div className="flex items-center gap-2 pt-1">
          <span className="sku">SKU {selected.sku}</span>
          <span className="text-inkfaint">&middot;</span>
          <span className={`font-mono text-xs ${selected.stock > 0 ? 'text-okgreen' : 'text-warnred'}`}>
            {selected.stock > 0 ? `${selected.stock} in stock` : 'Out of stock'}
          </span>
        </div>
      )}
    </div>
  );
}
