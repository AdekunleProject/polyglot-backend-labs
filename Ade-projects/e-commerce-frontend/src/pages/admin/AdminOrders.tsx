import { useEffect, useState } from 'react';
import { getAllOrders, updateOrder } from '../../api/orders';
import type { Order, OrderStatus } from '../../types';
import { extractErrorMessage } from '../../api/client';

const statuses: OrderStatus[] = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getAllOrders()
      .then(setOrders)
      .catch((err) => setError(extractErrorMessage(err, 'Could not load orders.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleStatusChange = async (orderId: string, status: OrderStatus) => {
    setSavingId(orderId);
    try {
      const updated = await updateOrder(orderId, { status });
      setOrders((os) => os.map((o) => (o._id === orderId ? updated : o)));
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update that order.'));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl uppercase mb-4">All Orders ({orders.length})</h2>
      {error && <p className="text-warnred font-mono text-sm mb-3">{error}</p>}
      {loading ? (
        <p className="label-eyebrow">Loading&hellip;</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o._id} className="ticket p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="sku">#{o._id.slice(-8).toUpperCase()}</p>
                <p className="font-mono text-xs text-inkfaint">{new Date(o.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="text-sm">
                <p className="font-mono font-semibold">${o.total.toFixed(2)}</p>
                <p className={`label-eyebrow ${o.paymentStatus === 'PAID' ? 'text-okgreen' : 'text-inkfaint'}`}>
                  {o.paymentStatus}
                </p>
              </div>
              <select
                className="input-field !py-1.5 !w-40"
                value={o.status}
                disabled={savingId === o._id}
                onChange={(e) => handleStatusChange(o._id, e.target.value as OrderStatus)}
              >
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {!loading && orders.length === 0 && <p className="label-eyebrow">No orders filed yet.</p>}
        </div>
      )}
    </div>
  );
}
