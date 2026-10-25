import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getProduct, listProducts } from '../api/products';
import { listVariantsForProduct } from '../api/variants';
import type { Product, ProductVariant } from '../types';
import VariantPicker from '../components/VariantPicker';
import ProductCard from '../components/ProductCard';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { extractErrorMessage } from '../api/client';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [related, setRelated] = useState<Product[]>([]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getProduct(id), listVariantsForProduct(id)])
      .then(([prod, vars]) => {
        setProduct(prod);
        setVariants(vars);
        setSelectedVariant(vars.find((v) => v.stock > 0) ?? vars[0] ?? null);

        // "You might also like" — same brand when available, otherwise
        // just other current products. No dedicated "related products"
        // endpoint exists on the backend.
        const brandId = typeof prod.brand === 'object' ? prod.brand?._id : prod.brand;
        listProducts({ brand: brandId || undefined, limit: 5 })
          .then((res) => setRelated(res.data.filter((p) => p._id !== id).slice(0, 4)))
          .catch(() => setRelated([]));
      })
      .catch((err) => setError(extractErrorMessage(err, 'Could not load this item.')))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddToCart = async () => {
    if (!user) {
      navigate('/login', { state: { from: { pathname: `/products/${id}` } } });
      return;
    }
    if (!selectedVariant) return;
    setStatus('');
    try {
      await addItem(selectedVariant._id, quantity);
      setStatus('Added to cart.');
    } catch (err) {
      setStatus(extractErrorMessage(err, 'Could not add item to cart.'));
    }
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto px-6 py-24 label-eyebrow">Loading product&hellip;</div>;
  }

  if (error || !product) {
    return <div className="max-w-6xl mx-auto px-6 py-24 text-warnred font-mono">{error || 'Item not found.'}</div>;
  }

  const images = product.images?.length ? product.images : [];
  const brandName = typeof product.brand === 'object' ? product.brand?.name : undefined;

  return (
    <div>
      <div className="bg-manila/60 border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 text-sm text-inkfaint">
          <a href="/" className="hover:text-rust">
            All Products
          </a>
          {brandName && (
            <>
              <span className="mx-2">/</span>
              <span>{brandName}</span>
            </>
          )}
          <span className="mx-2">/</span>
          <span className="text-ink">{product.name}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid md:grid-cols-2 gap-10">
        <div>
          <div className="aspect-square bg-manila/40 rounded-xl mb-3 overflow-hidden">
            {images[activeImage] ? (
              <img src={images[activeImage]} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center label-eyebrow">No Image</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2">
              {images.map((img, i) => (
                <button
                  key={img + i}
                  onClick={() => setActiveImage(i)}
                  className={`w-16 h-16 rounded-lg border-2 overflow-hidden ${
                    i === activeImage ? 'border-rust' : 'border-transparent'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="ticket p-6">
          {brandName && <p className="label-eyebrow mb-1">{brandName}</p>}
          <h1 className="text-3xl sm:text-4xl font-display font-800 leading-tight mb-2">{product.name}</h1>
          <p className="sku mb-4">SKU {product.sku}</p>

          <p className="font-display text-2xl font-700 text-rust mb-6">
            ${(selectedVariant?.price ?? product.price).toFixed(2)}
          </p>

          {product.description && <p className="text-sm text-inkfaint mb-6 leading-relaxed">{product.description}</p>}

          <div className="dashed-rule pt-6 mb-6">
            <VariantPicker variants={variants} selected={selectedVariant} onSelect={setSelectedVariant} />
          </div>

          <div className="flex items-center gap-3 mb-4">
            <label className="label-eyebrow" htmlFor="qty">
              Qty
            </label>
            <input
              id="qty"
              type="number"
              min={1}
              max={selectedVariant?.stock ?? 1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="input-field w-20"
            />
          </div>

          <button
            className="btn-primary w-full"
            disabled={!selectedVariant || selectedVariant.stock === 0}
            onClick={handleAddToCart}
          >
            {selectedVariant?.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
          </button>

          {status && <p className="text-sm mt-3 text-okgreen">{status}</p>}
        </div>
      </div>

      {related.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
          <h2 className="text-xl sm:text-2xl font-display font-700 mb-4">You Might Also Like</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
            {related.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
