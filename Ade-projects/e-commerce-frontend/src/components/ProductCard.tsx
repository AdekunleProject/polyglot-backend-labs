import { Link } from 'react-router-dom';
import type { Product } from '../types';

export default function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0];
  const brandName = typeof product.brand === 'object' ? product.brand?.name : undefined;

  return (
    <Link to={`/products/${product._id}`} className="group block ticket overflow-hidden hover:shadow-md transition-shadow">
      <div className="aspect-square bg-manila overflow-hidden relative">
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center label-eyebrow">No Image</div>
        )}
        {product.featured && (
          <span className="stamp absolute top-2 left-2 bg-rust border-rust text-white">Top Pick</span>
        )}
      </div>
      <div className="p-3 space-y-1">
        {brandName && <p className="label-eyebrow truncate">{brandName}</p>}
        <h3 className="font-body text-sm leading-snug line-clamp-2 group-hover:text-rust transition-colors min-h-[2.5rem]">
          {product.name}
        </h3>
        <p className="font-display text-lg font-700 text-ink pt-1">${product.price.toFixed(2)}</p>
      </div>
    </Link>
  );
}
