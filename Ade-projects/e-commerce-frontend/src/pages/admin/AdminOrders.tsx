import { useMemo, useState } from 'react';
import { LuPackage, LuSearch } from 'react-icons/lu';
import * as shop from '../../api/shop';
import { errorMessage } from '../../api/client';
import { EmptyState, ErrorState, Modal, PageLoader, StatusBadge, useAsync } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dateTime, money, ORDER_PAY_TONE, ORDER_STEPS, ORDER_TONE, personName, titleCase } from '../../lib/format';
import type { Order, OrderStatus } from '../../types';
import { PageHead } from './AdminLayout';

const FILTERS: ('all' | OrderStatus)[] = ['all', 'pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const customerOf = (o: Order) => personName(typeof o.user === 'string' ? undefined : o.user) || (typeof o.user === 'string' ? `#${o.user.slice(-6)}` : '—');

export default function AdminOrders() {
  const { user } = useAuth();
  const toast = useToast();
  const list = useAsync(() => shop.getAllOrders(), []);
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Order | null>(null);
  const [status, setStatus] = useState<OrderStatus>('pending');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => (list.data ?? []).filter((o) => (filter === 'all' || o.status === filter) &&
    (!q.trim() || `${o._id} ${customerOf(o)}`.toLowerCase().includes(q.trim().toLowerCase()))).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [list.data, filter, q]);
  const counts = useMemo(() => { const c: Record<string, number> = { all: list.data?.length ?? 0 }; (list.data ?? []).forEach((o) => { c[o.status] = (c[o.status] ?? 0) + 1; }); return c; }, [list.data]);

  const openOrder = (o: Order) => { setOpen(o); setStatus(o.status); };
  const save = async () => {
    if (!open || status === open.status) return;
    setBusy(true);
    try { const o = await shop.updateOrderStatus(open._id, status); toast.success(`Order marked ${status}`); setOpen({ ...open, ...o }); list.reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Orders" sub={user?.role === 'manager' ? 'Move orders through fulfilment.' : 'Every order in the store. Managers update fulfilment status.'} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filter === f ? 'bg-night-900 text-white' : 'bg-white text-ink ring-1 ring-line hover:ring-brand-300'}`}>{titleCase(f)} <span className="opacity-60">{counts[f] ?? 0}</span></button>)}
        </div>
        <div className="relative ml-auto w-full sm:w-64"><LuSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-mute" /><input className="field pl-10" placeholder="Order ID or customer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" /></div>
      </div>
      {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !rows.length ? <EmptyState icon={<LuPackage />} title="No orders here" text="Orders matching this view will show up here." /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[720px]">
          <thead className="border-b border-line bg-paper"><tr><th className="table-th">Order</th><th className="table-th">Customer</th><th className="table-th">Items</th><th className="table-th">Total</th><th className="table-th">Status</th><th className="table-th">Payment</th><th className="table-th">Placed</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((o) => (
              <tr key={o._id} onClick={() => openOrder(o)} className="cursor-pointer hover:bg-paper/70">
                <td className="table-td font-mono text-xs">#{o._id.slice(-8)}</td><td className="table-td font-medium">{customerOf(o)}</td>
                <td className="table-td text-mute">{o.items.reduce((s, i) => s + i.quantity, 0)}</td><td className="table-td font-semibold">{money(o.total)}</td>
                <td className="table-td"><StatusBadge tone={ORDER_TONE[o.status]}>{titleCase(o.status)}</StatusBadge></td>
                <td className="table-td"><StatusBadge tone={ORDER_PAY_TONE[o.paymentStatus]}>{titleCase(o.paymentStatus)}</StatusBadge></td>
                <td className="table-td text-mute">{dateTime(o.createdAt)}</td>
              </tr>
            ))}
          </tbody></table></div></div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Order #${open._id.slice(-8)}` : ''} wide>
        {open && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2"><StatusBadge tone={ORDER_TONE[open.status]}>{titleCase(open.status)}</StatusBadge><StatusBadge tone={ORDER_PAY_TONE[open.paymentStatus]}>Payment {open.paymentStatus}</StatusBadge><span className="text-sm text-mute">{customerOf(open)} · {dateTime(open.createdAt)}</span></div>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {open.items.map((i) => (
                <li key={i.variantId} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0"><p className="truncate font-semibold">{i.productName}</p><p className="text-xs text-mute">{Object.values(i.attributes).join(' · ')} · {i.variantSku} · ×{i.quantity}</p></div>
                  <span className="font-semibold">{money(i.totalPrice)}</span>
                </li>
              ))}
              <li className="flex justify-between bg-paper p-3 text-sm font-bold"><span>Total</span><span>{money(open.total)}</span></li>
            </ul>
            <div className="rounded-xl bg-paper p-4 text-sm"><p className="label">Ship to</p>{open.shippingAddress.fullName}, {open.shippingAddress.line1}{open.shippingAddress.line2 ? `, ${open.shippingAddress.line2}` : ''}, {open.shippingAddress.city}, {open.shippingAddress.state} {open.shippingAddress.postalCode}{open.shippingAddress.phoneNumber ? ` · ${open.shippingAddress.phoneNumber}` : ''}</div>
            {user?.role === 'manager' ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-48 flex-1"><span className="label">Update status</span>
                  <select className="field" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}>{[...ORDER_STEPS, 'cancelled' as OrderStatus].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></label>
                <button className="btn-primary" disabled={busy || status === open.status} onClick={save}>{busy ? 'Saving…' : 'Save status'}</button>
              </div>
            ) : <p className="text-xs text-mute">Only managers can change fulfilment status.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
