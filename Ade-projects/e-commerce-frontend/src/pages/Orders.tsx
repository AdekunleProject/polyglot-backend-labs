import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyOrders } from '../api/orders';
import type { Order } from '../types';
import { extractErrorMessage } from '../api/client';

const statusColor: Record<string, string> = {
  PENDING: 'text-inkfaint border-inkfaint',
  PROCESSING: 'text-steel border-steel',
  SHIPPED: 'text-steel border-steel',
  DELIVERED: 'text-okgreen border-okgreen',
  CANCELLED: 'text-warnred border-warnred',
};

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyOrders()
      .then(setOrders)
      .catch((err) => {
        // Backend throws a 404 when there are simply no orders yet — treat that as empty, not an error.
        if (err?.response?.status === 404) setOrders([]);
        else setError(extractErrorMessage(err, 'Could not load your orders.'));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <p className="label-eyebrow mb-2">Order History</p>
      <h1 className="text-4xl sm:text-5xl font-display font-800 mb-8">My Orders</h1>

      {loading && <p className="label-eyebrow">Loading your orders&hellip;</p>}
      {error && <p className="text-warnred font-mono text-sm">{error}</p>}

      {!loading && orders.length === 0 && !error && (
        <div className="ticket p-10 text-center">
          <p className="label-eyebrow mb-4">No orders filed yet.</p>
          <Link to="/" className="btn-primary inline-block">
            Browse Catalog
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {orders.map((order) => (
          <Link key={order._id} to={`/orders/${order._id}`} className="ticket p-5 flex items-center justify-between block hover:border-ink">
            <div>
              <p className="sku mb-1">#{order._id.slice(-8).toUpperCase()}</p>
              <p className="font-display text-lg uppercase">
                {order.items.length} item{order.items.length !== 1 ? 's' : ''}
              </p>
              <p className="font-mono text-xs text-inkfaint">{new Date(order.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-semibold mb-1">${order.total.toFixed(2)}</p>
              <span className={`stamp inline-block ${statusColor[order.status] ?? 'text-inkfaint border-inkfaint'}`}>
                {order.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
