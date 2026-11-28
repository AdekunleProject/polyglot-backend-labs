import { Link } from 'react-router-dom';
import { LuRotateCcw } from 'react-icons/lu';
import { getMyRefunds } from '../api/shop';
import { EmptyState, ErrorState, PageLoader, StatusBadge, useAsync } from '../components/ui';
import { dateTime, money, REFUND_TONE, titleCase } from '../lib/format';
import type { RefundStatus } from '../types';

const EXPLAIN: Record<RefundStatus, string> = {
  SUBMITTED: 'We received your request and a team member will review it.',
  VERIFIED: 'Your evidence was checked. An admin will make the final decision.',
  REJECTED: 'We could not verify the problem from the evidence provided.',
  DECLINED: 'This request was declined.',
  REFUNDED: 'Your money is on its way back to you.',
  REPLACEMENT_APPROVED: 'A replacement was approved and will be dispatched soon.',
  REPLACEMENT_SENT: 'Your replacement has been dispatched.',
};

export default function Refunds() {
  const list = useAsync(getMyRefunds, []);
  return (
    <div className="container-x max-w-4xl py-8 sm:py-10">
      <h1 className="mb-2 font-display text-3xl font-extrabold sm:text-4xl">Returns & refunds</h1>
      <p className="mb-6 text-mute">Faults can be reported within 72 hours of delivery. Open an order to start a request.</p>
      {list.loading ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data!.length === 0 ? (
        <EmptyState icon={<LuRotateCcw />} title="No requests" text="If something goes wrong with an order, you can start a request from its page." action={<Link to="/orders" className="btn-primary">Go to my orders</Link>} />
      ) : (
        <ul className="space-y-4">
          {list.data!.map((r) => (
            <li key={r.id} className="card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="font-display font-bold">{r.type === 'DEFECT' ? 'Faulty item' : 'Cancellation'} · {titleCase(r.resolution)}</p><p className="text-xs text-mute">{dateTime(r.createdAt)} · <Link className="font-semibold text-brand-600 hover:underline" to={`/orders/${r.order}`}>View order</Link></p></div>
                <div className="text-right"><StatusBadge tone={REFUND_TONE[r.status]}>{titleCase(r.status)}</StatusBadge><p className="mt-1 font-display font-bold">{money(r.amount)}</p></div>
              </div>
              <p className="mt-3 rounded-xl bg-brand-50/60 p-3 text-sm text-ink/80">{EXPLAIN[r.status]}</p>
              <p className="mt-3 text-sm text-mute">“{r.reason}”</p>
              {(r.verificationNote || r.decisionNote) && <p className="mt-2 text-sm"><b>Our note:</b> {r.decisionNote || r.verificationNote}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
