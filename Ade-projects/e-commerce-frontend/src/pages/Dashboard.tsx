import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyOrders } from '../api/orders';
import { getMyPayments, Payment } from '../api/payments';
import type { Order } from '../types';

export default function Dashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getMyOrders().catch((err) => (err?.response?.status === 404 ? [] : Promise.reject(err))),
      getMyPayments().catch(() => []),
    ])
      .then(([o, p]) => {
        setOrders(o as Order[]);
        setPayments(p as Payment[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
  const pendingPayments = payments.filter((p) => p.status === 'PENDING').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <p className="label-eyebrow mb-2">Your Dashboard</p>
      <h1 className="text-4xl sm:text-5xl font-800 mb-8">
        Welcome back, {user?.firstname}
      </h1>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <StatCard label="Orders Filed" value={loading ? '—' : String(orders.length)} />
        <StatCard label="Total Spent" value={loading ? '—' : `$${totalSpent.toFixed(2)}`} />
        <StatCard
          label="Payments Pending"
          value={loading ? '—' : String(pendingPayments)}
          accent={pendingPayments > 0}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-8">
        <Link to="/orders" className="ticket p-5 hover:border-ink block">
          <p className="font-display text-xl font-700 mb-1">My Orders</p>
          <p className="label-eyebrow">View shipment history &amp; status</p>
        </Link>
        <Link to="/payments" className="ticket p-5 hover:border-ink block">
          <p className="font-display text-xl uppercase mb-1">Payment Records</p>
          <p className="label-eyebrow">Track transactions &amp; receipts</p>
        </Link>
        <Link to="/profile" className="ticket p-5 hover:border-ink block">
          <p className="font-display text-xl uppercase mb-1">Account Profile</p>
          <p className="label-eyebrow">Update your account details</p>
        </Link>
        <Link to="/" className="ticket p-5 hover:border-ink block">
          <p className="font-display text-xl uppercase mb-1">Catalog</p>
          <p className="label-eyebrow">Browse the current inventory</p>
        </Link>
      </div>

      {orders.length > 0 && (
        <div>
          <h2 className="font-display text-xl uppercase mb-3">Recent Orders</h2>
          <div className="space-y-2">
            {orders.slice(0, 3).map((order) => (
              <Link key={order._id} to={`/orders/${order._id}`} className="ticket p-4 flex items-center justify-between block hover:border-ink">
                <div>
                  <p className="sku">#{order._id.slice(-8).toUpperCase()}</p>
                  <p className="font-mono text-xs text-inkfaint">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold">${order.total.toFixed(2)}</p>
                  <p className="label-eyebrow">{order.status}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="ticket p-5">
      <p className="label-eyebrow mb-2">{label}</p>
      <p className={`font-mono text-3xl font-semibold ${accent ? 'text-rust' : ''}`}>{value}</p>
    </div>
  );
}
