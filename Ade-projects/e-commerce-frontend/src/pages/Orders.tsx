import { Link } from 'react-router-dom';
import { LuChevronRight, LuPackage } from 'react-icons/lu';
import { getMyOrders } from '../api/shop';
import { EmptyState, ErrorState, PageLoader, StatusBadge, useAsync } from '../components/ui';
import { ProductImage } from '../components/ProductCard';
import { dateShort, money, ORDER_PAY_TONE, ORDER_TONE, titleCase } from '../lib/format';

export default function Orders() {
  const orders = useAsync(getMyOrders, []);
  return (
    <div className="container-x max-w-4xl py-8 sm:py-10">
      <h1 className="mb-6 font-display text-3xl font-extrabold sm:text-4xl">My orders</h1>
      {orders.loading ? <PageLoader /> : orders.error ? <ErrorState error={orders.error} onRetry={orders.reload} /> : orders.data!.length === 0 ? (
        <EmptyState icon={<LuPackage />} title="No orders yet" text="When you place an order, you can track it here." action={<Link to="/shop" className="btn-primary">Start shopping</Link>} />
      ) : (
        <ul className="space-y-4">
          {orders.data!.map((o) => (
            <li key={o._id}>
              <Link to={`/orders/${o._id}`} className="card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lift sm:flex-row sm:items-center">
                <div className="flex -space-x-3">
                  {o.items.slice(0, 3).map((i) => <div key={i.variantId} className="h-14 w-14 overflow-hidden rounded-xl border-2 border-white bg-brand-50"><ProductImage product={{ name: i.productName, images: i.images }} /></div>)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-semibold">{o.items.map((i) => i.productName).join(', ')}</p>
                  <p className="mt-0.5 text-xs text-mute">Placed {dateShort(o.createdAt)} · #{o._id.slice(-8).toUpperCase()}</p>
                  <div className="mt-2 flex flex-wrap gap-2"><StatusBadge tone={ORDER_TONE[o.status]}>{titleCase(o.status)}</StatusBadge><StatusBadge tone={ORDER_PAY_TONE[o.paymentStatus]}>{o.paymentStatus === 'paid' ? 'Paid' : titleCase(o.paymentStatus)}</StatusBadge></div>
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1"><p className="font-display text-lg font-bold">{money(o.total)}</p><LuChevronRight className="text-mute transition group-hover:translate-x-1" /></div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
