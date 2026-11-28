import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LuCheck, LuCreditCard, LuPackage, LuRotateCcw, LuTruck, LuX } from 'react-icons/lu';
import { getMyOrder, getMyRefunds, requestRefund } from '../api/shop';
import { errorMessage } from '../api/client';
import { Alert, Breadcrumb, ErrorState, Field, Modal, PageLoader, Spinner, StatusBadge, useAsync } from '../components/ui';
import { ProductImage } from '../components/ProductCard';
import { useToast } from '../context/ToastContext';
import { dateTime, money, moneyExact, ORDER_PAY_TONE, ORDER_STEPS, ORDER_TONE, titleCase } from '../lib/format';
import type { Order } from '../types';

const HOURS = 3600_000;

function Timeline({ order }: { order: Order }) {
  if (order.status === 'cancelled') return <Alert>This order was cancelled.</Alert>;
  const at = ORDER_STEPS.indexOf(order.status);
  const icons = [<LuCheck />, <LuPackage />, <LuTruck />, <LuCheck />];
  return (
    <ol className="flex items-start justify-between gap-2" aria-label="Order progress">
      {ORDER_STEPS.map((s, i) => (
        <li key={s} className="relative flex flex-1 flex-col items-center text-center">
          {i > 0 && <span className={`absolute right-1/2 top-5 -z-0 h-1 w-full rounded-full ${i <= at ? 'bg-brand-gradient' : 'bg-line'}`} />}
          <span className={`relative z-10 grid h-10 w-10 place-items-center rounded-full text-lg ${i <= at ? 'bg-brand-gradient text-white shadow-glow' : 'bg-white text-mute ring-2 ring-line'}`}>{icons[i]}</span>
          <span className={`mt-2 text-xs font-semibold ${i <= at ? 'text-ink' : 'text-mute'}`}>{titleCase(s)}</span>
        </li>
      ))}
    </ol>
  );
}

export default function OrderDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const order = useAsync(() => getMyOrder(id), [id]);
  const refunds = useAsync(getMyRefunds, []);
  const [open, setOpen] = useState<null | 'DEFECT' | 'CANCELLATION'>(null);

  if (order.loading) return <PageLoader label="Loading order" />;
  if (order.error || !order.data) return <div className="container-x py-12"><ErrorState error={order.error} onRetry={order.reload} /></div>;
  const o = order.data;
  const existing = refunds.data?.find((r) => r.order === o._id);
  const sinceDelivery = o.deliveredAt ? Date.now() - new Date(o.deliveredAt).getTime() : null;
  const canReport = o.status === 'delivered' && o.paymentStatus === 'paid' && sinceDelivery !== null && sinceDelivery <= 72 * HOURS && !existing;
  const refundOnly24 = sinceDelivery !== null && sinceDelivery <= 24 * HOURS;
  const canCancel = ['pending', 'processing', 'shipped'].includes(o.status) && o.paymentStatus === 'paid' && !existing;
  const needsPayment = o.paymentStatus === 'pending' && o.status !== 'cancelled';
  const a = o.shippingAddress;

  return (
    <div className="container-x max-w-5xl py-8 sm:py-10">
      <Breadcrumb items={[{ label: 'Orders', to: '/orders' }, { label: `#${o._id.slice(-8).toUpperCase()}` }]} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-display text-3xl font-extrabold">Order #{o._id.slice(-8).toUpperCase()}</h1><p className="text-sm text-mute">Placed {dateTime(o.createdAt)}</p></div>
        <div className="flex gap-2"><StatusBadge tone={ORDER_TONE[o.status]}>{titleCase(o.status)}</StatusBadge><StatusBadge tone={ORDER_PAY_TONE[o.paymentStatus]}>{o.paymentStatus === 'paid' ? 'Paid' : titleCase(o.paymentStatus)}</StatusBadge></div>
      </div>

      {needsPayment && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div><p className="font-display font-bold text-amber-800">Payment needed</p><p className="text-sm text-amber-700">Pay {money(o.total)} to confirm this order.</p></div>
          <Link to={`/orders/${o._id}/pay`} className="btn-primary"><LuCreditCard /> Pay now</Link>
        </div>
      )}

      <div className="card-pad mb-6"><Timeline order={o} /></div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="card-pad">
          <h2 className="mb-4 font-display text-lg font-bold">Items</h2>
          <ul className="divide-y divide-line">
            {o.items.map((i) => (
              <li key={i.variantId} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <Link to={`/product/${i.productId}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-brand-50"><ProductImage product={{ name: i.productName, images: i.images }} /></Link>
                <div className="min-w-0 flex-1"><p className="font-display font-semibold">{i.productName}</p><p className="text-xs text-mute">{Object.entries(i.attributes ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p><p className="mt-1 text-sm text-mute">{i.quantity} × {money(i.unitPrice)}</p></div>
                <p className="font-display font-bold">{money(i.totalPrice)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-between border-t border-line pt-4"><span className="font-bold">Total</span><span className="font-display text-xl font-extrabold gradient-text">{moneyExact(o.total)}</span></div>
        </div>

        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="mb-3 font-display text-lg font-bold">Delivery</h2>
            <address className="text-sm not-italic leading-relaxed text-ink/80">{a.fullName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.postalCode}<br />{a.country}{a.phoneNumber && <><br />{a.phoneNumber}</>}</address>
          </div>
          <div className="card-pad">
            <h2 className="mb-3 font-display text-lg font-bold">Problem with this order?</h2>
            {existing ? (
              <div className="space-y-2 text-sm"><p>You already opened a request for this order.</p><Link to="/refunds" className="btn-ghost btn-sm w-full">Track request</Link></div>
            ) : canReport ? (
              <div className="space-y-3 text-sm"><p className="text-mute">Arrived broken or not as described? Tell us within 72 hours of delivery{refundOnly24 ? '.' : '. The 24-hour refund window has passed, so a replacement is available.'}</p><button className="btn-primary w-full" onClick={() => setOpen('DEFECT')}><LuRotateCcw /> Report a fault</button></div>
            ) : canCancel ? (
              <div className="space-y-3 text-sm"><p className="text-mute">Changed your mind before it arrived? Cancel for a 65% refund.</p><button className="btn-ghost w-full" onClick={() => setOpen('CANCELLATION')}><LuX /> Cancel for a refund</button></div>
            ) : <p className="text-sm text-mute">Refunds and replacements become available once an order is paid. Faults can be reported for 72 hours after delivery.</p>}
          </div>
        </div>
      </div>

      <RefundModal order={o} kind={open} refundWindow={refundOnly24} onClose={() => setOpen(null)} onDone={() => { setOpen(null); toast.success('Request sent. We will review it shortly.'); refunds.reload(); }} />
    </div>
  );
}

function RefundModal({ order, kind, refundWindow, onClose, onDone }: { order: Order; kind: null | 'DEFECT' | 'CANCELLATION'; refundWindow: boolean; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState<'REFUND' | 'REPLACEMENT'>(refundWindow ? 'REFUND' : 'REPLACEMENT');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!kind) return;
    if (reason.trim().length < 10) { setError('Please describe what happened in at least 10 characters.'); return; }
    if (kind === 'DEFECT' && files.length === 0) { setError('Add at least one clear photo or video of the problem.'); return; }
    setBusy(true); setError('');
    try {
      await requestRefund({ orderId: order._id, type: kind, resolution: kind === 'DEFECT' ? resolution : undefined, reason: reason.trim() }, files);
      setReason(''); setFiles([]);
      onDone();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!kind} onClose={onClose} title={kind === 'DEFECT' ? 'Report a fault' : 'Cancel for a refund'} wide>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {kind === 'CANCELLATION' && <Alert tone="info">Because the order has not arrived, you will get 65% of {money(order.total)} back, which is {money(Math.round(order.total * 0.65))}.</Alert>}
        {kind === 'DEFECT' && (
          <div>
            <p className="label">What would you like?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['REFUND', 'REPLACEMENT'] as const).map((r) => (
                <button key={r} type="button" disabled={r === 'REFUND' && !refundWindow} onClick={() => setResolution(r)} aria-pressed={resolution === r}
                  className={`rounded-xl border-2 p-4 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${resolution === r ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-300'}`}>
                  <b className="block font-display">{r === 'REFUND' ? 'Full refund' : 'Replacement'}</b>
                  <span className="text-mute">{r === 'REFUND' ? (refundWindow ? 'Within 24h of delivery' : 'Only within 24h of delivery') : 'Within 72h of delivery'}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="What happened?"><textarea className="field min-h-28" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describe the problem" maxLength={1000} /></Field>
        {kind === 'DEFECT' && (
          <Field label="Photos or video" hint="Clear evidence helps us decide quickly. Up to 5 files.">
            <input className="field" type="file" multiple accept="image/*,video/*" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2"><button className="btn-ghost" onClick={onClose}>Close</button><button className="btn-primary" disabled={busy} onClick={submit}>{busy && <Spinner />} Send request</button></div>
      </div>
    </Modal>
  );
}
