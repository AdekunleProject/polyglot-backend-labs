import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getMyOrder } from '../api/orders';
import type { Order } from '../types';
import { extractErrorMessage } from '../api/client';

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const justPlaced = (location.state as { justPlaced?: boolean })?.justPlaced;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    getMyOrder(id)
      .then(setOrder)
      .catch((err) => setError(extractErrorMessage(err, 'Could not load this order.')))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="max-w-3xl mx-auto px-6 py-24 label-eyebrow">Loading order&hellip;</div>;
  if (error || !order) return <div className="max-w-3xl mx-auto px-6 py-24 text-warnred font-mono">{error}</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {justPlaced && (
        <div className="border-2 border-okgreen text-okgreen font-mono text-sm p-3 mb-6">
          Order placed successfully. A copy has been saved to your account.
        </div>
      )}

      <div className="ticket p-6 sm:p-8">
        <div className="flex items-start justify-between mb-6 dashed-rule pb-4">
          <div>
            <p className="label-eyebrow mb-1">Order Receipt</p>
            <h1 className="font-display text-2xl uppercase">#{order._id.slice(-8).toUpperCase()}</h1>
            <p className="font-mono text-xs text-inkfaint mt-1">{new Date(order.createdAt).toLocaleString()}</p>
          </div>
          <span className="stamp border-ink text-ink">{order.status}</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mb-6">
          <div>
            <p className="label-eyebrow mb-2">Ship To</p>
            <p className="text-sm leading-relaxed">
              {order.shippingAddress.fullName}
              <br />
              {order.shippingAddress.line1}
              {order.shippingAddress.line2 && (
                <>
                  <br />
                  {order.shippingAddress.line2}
                </>
              )}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}
              <br />
              {order.shippingAddress.country}
            </p>
          </div>
          <div>
            <p className="label-eyebrow mb-2">Payment</p>
            <p className={`stamp inline-block mb-2 ${order.paymentStatus === 'PAID' ? 'border-okgreen text-okgreen' : order.paymentStatus === 'FAILED' ? 'border-warnred text-warnred' : 'border-inkfaint text-inkfaint'}`}>
              {order.paymentStatus}
            </p>
            {order.paymentStatus === 'PENDING' && (
              <Link to={`/orders/${order._id}/pay`} className="btn-primary !inline-block !px-4 !py-2 !text-xs">
                Pay Now
              </Link>
            )}
          </div>
        </div>

        <div className="dashed-rule pt-4">
          <p className="label-eyebrow mb-3">Contents</p>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.variantId} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-display text-base uppercase">{item.productName}</p>
                  <p className="sku">
                    {item.variantSku} &middot; Qty {item.quantity}
                  </p>
                </div>
                <p className="font-mono">${item.totalPrice.toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="dashed-rule pt-4 mt-4 flex justify-between items-baseline">
          <span className="label-eyebrow">Total</span>
          <span className="font-mono text-2xl font-semibold">${order.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
