import { Link } from 'react-router-dom';
import { LuStar } from 'react-icons/lu';
import { money, nameOf } from '../lib/format';
import { productArt } from '../lib/art';
import type { Product } from '../types';

export function ProductImage({ product, index = 0, className = '' }: { product?: Pick<Product, 'name' | 'images'>; index?: number; className?: string }) {
  const src = product?.images?.[index] || productArt(product?.name ?? 'harlim');
  return <img src={src} alt={product?.name ?? 'Product'} loading="lazy" className={`${/\b[hw]-\d/.test(className) ? '' : 'h-full w-full'} object-cover ${className}`} />;
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/product/${product._id}`} className="group card flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1.5 hover:shadow-lift">
      <div className="relative aspect-square overflow-hidden bg-brand-50">
        <ProductImage product={product} className="transition duration-500 group-hover:scale-110" />
        {product.featured && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-night-900/85 px-2.5 py-1 text-[11px] font-bold text-gold-300 backdrop-blur">
            <LuStar className="fill-gold-300" /> Featured
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-600">{nameOf(product.brand) || nameOf(product.category)}</p>
        <h3 className="mt-1 line-clamp-2 min-h-[2.6rem] font-display text-[15px] font-semibold leading-snug">{product.name}</h3>
        <p className="mt-auto pt-3 font-display text-lg font-bold">{money(product.price)}</p>
      </div>
    </Link>
  );
}

export function ProductGridSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card overflow-hidden">
          <div className="skeleton aspect-square rounded-none" />
          <div className="space-y-2 p-4"><div className="skeleton h-3 w-1/3" /><div className="skeleton h-4 w-4/5" /><div className="skeleton h-5 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}
