import { Link } from 'react-router-dom';
import { LuArrowRight, LuClock, LuPackage, LuTruck, LuWallet, LuX } from 'react-icons/lu';
import { dashboard } from '../api/admin';
import { ErrorState, PageLoader, SectionHead, Stat, StatusBadge, useAsync } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { dateShort, money, ORDER_PAY_TONE, ORDER_TONE, titleCase } from '../lib/format';

export default function Account() {
  const { user } = useAuth();
  const d = useAsync(() => dashboard('customer'), []);
  if (d.loading) return <PageLoader />;
  if (d.error || !d.data) return <div className="container-x py-12"><ErrorState error={d.error} onRetry={d.reload} /></div>;
  const { orders, payments } = d.data.summary;
  const recent = d.data.recentOrders as { _id: string; total: number; status: keyof typeof ORDER_TONE; paymentStatus: keyof typeof ORDER_PAY_TONE; createdAt: string }[];

  return (
    <div className="container-x py-8 sm:py-10">
      <div className="hero-bg relative isolate mb-8 overflow-hidden rounded-3xl p-7 text-white sm:p-10">
        <div className="grid-lines absolute inset-0 -z-10 opacity-60" />
        <p className="text-sm text-white/60">Welcome back</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">Hello, {user?.firstname}</h1>
        <p className="mt-2 max-w-lg text-white/70">Here is what is happening with your orders and spending.</p>
        <div className="mt-6 flex flex-wrap gap-3"><Link to="/shop" className="btn-primary">Keep shopping <LuArrowRight /></Link><Link to="/account/security" className="btn-light">Profile & security</Link></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders" value={orders.totalOrders} icon={<LuPackage />} />
        <Stat label="Awaiting" value={orders.pendingOrders} icon={<LuClock />} tone="amber" />
        <Stat label="Delivered" value={orders.deliveredOrders} icon={<LuTruck />} tone="emerald" />
        <Stat label="Cancelled" value={orders.cancelledOrders} icon={<LuX />} tone="rose" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat label="Total spent" value={money(payments.totalSpent)} icon={<LuWallet />} />
        <Stat label="Average payment" value={money(Math.round(payments.averagePayment))} icon={<LuWallet />} tone="sky" />
        <Stat label="Payments made" value={payments.totalPayments} icon={<LuWallet />} tone="emerald" />
      </div>

      <section className="mt-10">
        <SectionHead title="Recent orders" action={<Link to="/orders" className="text-sm font-semibold text-brand-600 hover:underline">All orders →</Link>} />
        {recent.length === 0 ? <p className="card-pad text-center text-mute">No orders yet.</p> : (
          <div className="card divide-y divide-line">
            {recent.map((o) => (
              <Link key={o._id} to={`/orders/${o._id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-brand-50/50 sm:px-6">
                <div><p className="font-semibold">#{o._id.slice(-8).toUpperCase()}</p><p className="text-xs text-mute">{dateShort(o.createdAt)}</p></div>
                <div className="flex gap-2"><StatusBadge tone={ORDER_TONE[o.status]}>{titleCase(o.status)}</StatusBadge><StatusBadge tone={ORDER_PAY_TONE[o.paymentStatus]}>{o.paymentStatus === 'paid' ? 'Paid' : titleCase(o.paymentStatus)}</StatusBadge></div>
                <p className="font-display font-bold">{money(o.total)}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
