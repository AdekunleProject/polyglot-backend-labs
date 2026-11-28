import { useMemo, useState } from 'react';
import { LuBadgeDollarSign, LuCheck, LuExternalLink, LuX } from 'react-icons/lu';
import * as shop from '../../api/shop';
import { errorMessage } from '../../api/client';
import { EmptyState, ErrorState, PageLoader, StatusBadge, useAsync } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { dateTime, moneyExact, PAYMENT_TONE, personName, titleCase } from '../../lib/format';
import type { Payment } from '../../types';
import { PageHead } from './AdminLayout';

export default function AdminPayments() {
  const toast = useToast();
  const list = useAsync(() => shop.getAllPayments(), []);
  const [tab, setTab] = useState<'review' | 'all'>('review');
  const [busy, setBusy] = useState('');
  const rows = useMemo(() => (list.data ?? []).filter((p) => tab === 'all' || p.status === 'AWAITING_CONFIRMATION').sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [list.data, tab]);
  const waiting = (list.data ?? []).filter((p) => p.status === 'AWAITING_CONFIRMATION').length;

  const act = async (p: Payment, approve: boolean) => {
    setBusy(p._id);
    try { await (approve ? shop.approveTransfer(p._id) : shop.rejectTransfer(p._id)); toast.success(approve ? 'Transfer approved. The order is now paid.' : 'Transfer rejected.'); list.reload(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(''); }
  };

  return (
    <div>
      <PageHead title="Payments" sub="Card payments settle automatically. Bank transfers wait here until you confirm the money arrived." />
      <div className="mb-4 flex gap-1.5">
        <button onClick={() => setTab('review')} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${tab === 'review' ? 'bg-night-900 text-white' : 'bg-white ring-1 ring-line'}`}>Needs review <span className="opacity-60">{waiting}</span></button>
        <button onClick={() => setTab('all')} className={`rounded-full px-4 py-1.5 text-xs font-semibold ${tab === 'all' ? 'bg-night-900 text-white' : 'bg-white ring-1 ring-line'}`}>All payments <span className="opacity-60">{list.data?.length ?? 0}</span></button>
      </div>
      {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !rows.length ? <EmptyState icon={<LuBadgeDollarSign />} title={tab === 'review' ? 'Nothing to review' : 'No payments yet'} text={tab === 'review' ? 'Submitted bank transfers will appear here.' : undefined} /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px]">
          <thead className="border-b border-line bg-paper"><tr><th className="table-th">Reference</th><th className="table-th">Customer</th><th className="table-th">Method</th><th className="table-th">Amount</th><th className="table-th">Status</th><th className="table-th">Date</th><th className="table-th text-right">Action</th></tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p._id}>
                <td className="table-td font-mono text-xs">{p.transactionReference}</td>
                <td className="table-td font-medium">{personName(typeof p.user === 'string' ? undefined : p.user) || '—'}</td>
                <td className="table-td">{p.provider === 'PAYSTACK' ? 'Card (Paystack)' : 'Bank transfer'}</td>
                <td className="table-td font-semibold">{moneyExact(p.amount)}</td>
                <td className="table-td"><StatusBadge tone={PAYMENT_TONE[p.status]}>{titleCase(p.status)}</StatusBadge></td>
                <td className="table-td text-mute">{dateTime(p.createdAt)}</td>
                <td className="table-td"><div className="flex justify-end gap-1.5">
                  {(p.receiptUrl || p.receipt) && <a className="btn-ghost btn-sm" href={p.receipt || p.receiptUrl} target="_blank" rel="noreferrer noopener"><LuExternalLink /> Receipt</a>}
                  {p.status === 'AWAITING_CONFIRMATION' && <>
                    <button className="btn-primary btn-sm" disabled={busy === p._id} onClick={() => act(p, true)}><LuCheck /> Approve</button>
                    <button className="btn-ghost btn-sm text-rose-600" disabled={busy === p._id} onClick={() => act(p, false)}><LuX /> Reject</button>
                  </>}
                </div></td>
              </tr>
            ))}
          </tbody></table></div></div>
      )}
    </div>
  );
}
