import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { listProducts } from '../../api/products';
import { getAllOrders } from '../../api/orders';
import { getAllPayments } from '../../api/payments';
import type { Order } from '../../types';
import type { Payment } from '../../api/payments';

// Builds a day-by-day revenue trend from real order timestamps — no
// analytics endpoint exists on the backend, so this is derived client-side
// from GET /orders rather than a fabricated metric.
function buildTrend(orders: Order[], days: number) {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    buckets.set(key, 0);
  }
  orders
    .filter((o) => o.paymentStatus === 'PAID')
    .forEach((o) => {
      const key = new Date(o.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + o.total);
    });
  return Array.from(buckets, ([date, revenue]) => ({ date, revenue }));
}

export default function AdminOverview() {
  const [productCount, setProductCount] = useState<number | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listProducts({ limit: 1 }).catch(() => ({ meta: { total: 0 } } as any)),
      getAllOrders().catch(() => []),
      getAllPayments().catch(() => []),
    ]).then(([products, ord, pay]) => {
      setProductCount(products.meta?.total ?? 0);
      setOrders(ord);
      setPayments(pay);
      setLoading(false);
    });
  }, []);

  const trend = useMemo(() => buildTrend(orders, 14), [orders]);

  const revenue = orders
    .filter((o) => o.paymentStatus === 'PAID')
    .reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = orders.filter((o) => o.status === 'PENDING').length;
  const pendingTransfers = payments.filter((p) => p.provider === 'BANK_TRANSFER' && p.status === 'AWAITING_CONFIRMATION').length;

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Products" value={loading ? '—' : String(productCount)} />
        <StatCard label="Total Orders" value={loading ? '—' : String(orders.length)} />
        <StatCard label="Confirmed Revenue" value={loading ? '—' : `$${revenue.toFixed(2)}`} />
        <StatCard
          label="Transfers Awaiting Review"
          value={loading ? '—' : String(pendingTransfers)}
          accent={pendingTransfers > 0}
        />
      </div>

      <div className="ticket p-5 mb-6">
        <p className="font-display text-lg font-700 mb-1">Revenue — Last 14 Days</p>
        <p className="label-eyebrow mb-4">Paid orders only</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke="#EEF0F5" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Revenue']} />
              <Line type="monotone" dataKey="revenue" stroke="#2F5FE0" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="ticket p-5">
          <p className="font-display text-lg font-700 mb-3">Pending Orders ({pendingOrders})</p>
          <div className="space-y-2">
            {orders
              .filter((o) => o.status === 'PENDING')
              .slice(0, 5)
              .map((o) => (
                <Link key={o._id} to="/admin/orders" className="flex justify-between text-sm hover:text-rust">
                  <span className="sku">#{o._id.slice(-8).toUpperCase()}</span>
                  <span className="font-medium">${o.total.toFixed(2)}</span>
                </Link>
              ))}
            {!loading && pendingOrders === 0 && <p className="label-eyebrow">Nothing queued.</p>}
          </div>
        </div>

        <div className="ticket p-5">
          <p className="font-display text-lg font-700 mb-3">Transfers to Review</p>
          <div className="space-y-2">
            {payments
              .filter((p) => p.provider === 'BANK_TRANSFER' && p.status === 'AWAITING_CONFIRMATION')
              .slice(0, 5)
              .map((p) => (
                <Link key={p._id} to="/admin/payments" className="flex justify-between text-sm hover:text-rust">
                  <span className="sku">{p.transactionReference}</span>
                  <span className="font-medium">
                    {p.currency} {p.amount.toFixed(2)}
                  </span>
                </Link>
              ))}
            {!loading && pendingTransfers === 0 && <p className="label-eyebrow">Nothing queued.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="ticket p-5">
      <p className="label-eyebrow mb-2">{label}</p>
      <p className={`font-display text-3xl font-700 ${accent ? 'text-rust' : ''}`}>{value}</p>
    </div>
  );
}
