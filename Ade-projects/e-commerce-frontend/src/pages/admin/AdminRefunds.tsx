import { useState, type FormEvent } from 'react';
import { LuRotateCcw } from 'react-icons/lu';
import * as shop from '../../api/shop';
import { errorMessage } from '../../api/client';
import { Alert, EmptyState, ErrorState, Modal, PageLoader, Pager, StatusBadge, useAsync } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { dateTime, money, REFUND_TONE, titleCase } from '../../lib/format';
import type { Refund, RefundStatus } from '../../types';
import { PageHead } from './AdminLayout';

const STATUSES: ('' | RefundStatus)[] = ['', 'SUBMITTED', 'VERIFIED', 'REPLACEMENT_APPROVED', 'REFUNDED', 'REPLACEMENT_SENT', 'REJECTED', 'DECLINED'];
const LIMIT = 10;

/** What the signed-in role may do next with a request. */
function nextStep(r: Refund, role: string): 'verify' | 'decide' | 'send' | null {
  if (role === 'manager') {
    if (r.type === 'DEFECT' && r.status === 'SUBMITTED') return 'verify';
    if (r.status === 'REPLACEMENT_APPROVED') return 'send';
  } else {
    if ((r.type === 'DEFECT' && r.status === 'VERIFIED') || (r.type === 'CANCELLATION' && r.status === 'SUBMITTED')) return 'decide';
  }
  return null;
}

export default function AdminRefunds() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<'' | RefundStatus>('');
  const [page, setPage] = useState(1);
  const list = useAsync(() => shop.listRefunds({ status: status || undefined, page, limit: LIMIT }), [status, page]);
  const [active, setActive] = useState<Refund | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const step = active && user ? nextStep(active, user.role) : null;

  const open = (r: Refund) => { setActive(r); setNote(''); setErr(''); };
  const review = async (e: FormEvent, approve: boolean) => {
    e.preventDefault();
    if (!active) return;
    if (note.trim().length < 5) { setErr('Write a note of at least 5 characters. The customer sees it.'); return; }
    setBusy(true); setErr('');
    try {
      await (step === 'verify' ? shop.verifyRefund(active.id, approve, note.trim()) : shop.decideRefund(active.id, approve, note.trim()));
      toast.success(step === 'verify' ? (approve ? 'Complaint verified' : 'Complaint rejected') : (approve ? 'Request approved' : 'Request declined'));
      setActive(null); list.reload();
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };
  const sent = async () => {
    if (!active) return;
    setBusy(true);
    try { await shop.markReplacementSent(active.id); toast.success('Replacement marked as sent'); setActive(null); list.reload(); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHead title="Refunds & replacements" sub="Managers verify the evidence and send replacements. Admins decide." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUSES.map((s) => <button key={s || 'all'} onClick={() => { setStatus(s); setPage(1); }} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${status === s ? 'bg-night-900 text-white' : 'bg-white ring-1 ring-line hover:ring-brand-300'}`}>{s ? titleCase(s) : 'All'}</button>)}
      </div>
      {list.loading && !list.data ? <PageLoader /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data?.items.length ? <EmptyState icon={<LuRotateCcw />} title="No requests" text="Refund and replacement requests will appear here." /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[760px]">
          <thead className="border-b border-line bg-paper"><tr><th className="table-th">Request</th><th className="table-th">Type</th><th className="table-th">Reason</th><th className="table-th">Amount</th><th className="table-th">Status</th><th className="table-th">Sent</th><th className="table-th" /></tr></thead>
          <tbody className="divide-y divide-line">
            {list.data.items.map((r) => {
              const todo = user ? nextStep(r, user.role) : null;
              return (
                <tr key={r.id} className="cursor-pointer hover:bg-paper/70" onClick={() => open(r)}>
                  <td className="table-td font-mono text-xs">#{r.id.slice(-8)}</td>
                  <td className="table-td">{r.type === 'DEFECT' ? 'Faulty item' : 'Cancellation'} · {titleCase(r.resolution)}</td>
                  <td className="table-td max-w-xs truncate text-mute">{r.reason}</td>
                  <td className="table-td font-semibold">{money(r.amount)}</td>
                  <td className="table-td"><StatusBadge tone={REFUND_TONE[r.status]}>{titleCase(r.status)}</StatusBadge></td>
                  <td className="table-td text-mute">{dateTime(r.createdAt)}</td>
                  <td className="table-td text-right">{todo && <span className="badge-amber">Your turn</span>}</td>
                </tr>
              );
            })}
          </tbody></table></div></div>
      )}
      <Pager page={page} pages={Math.max(1, Math.ceil((list.data?.total ?? 0) / LIMIT))} onChange={setPage} />

      <Modal open={!!active} onClose={() => setActive(null)} title={active ? `Request #${active.id.slice(-8)}` : ''} wide>
        {active && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={REFUND_TONE[active.status]}>{titleCase(active.status)}</StatusBadge><span className="text-sm text-mute">{active.type === 'DEFECT' ? 'Faulty item' : 'Cancellation'} · wants a {active.resolution.toLowerCase()} · {money(active.amount)}</span></div>
            <div className="rounded-xl bg-paper p-4 text-sm"><p className="label">Customer's reason</p>{active.reason}</div>
            {active.evidence.length > 0
              ? <div className="grid grid-cols-3 gap-2">{active.evidence.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="block overflow-hidden rounded-xl border border-line"><img src={u} alt="Evidence photo" className="h-24 w-full object-cover" /></a>)}</div>
              : <p className="text-xs text-mute">{active.evidenceCount ? `${active.evidenceCount} evidence photo(s) attached.` : 'No photos attached.'}</p>}
            {active.verificationNote && <div className="rounded-xl bg-sky-50 p-3 text-sm"><b>Manager's note:</b> {active.verificationNote}</div>}
            {active.decisionNote && <div className="rounded-xl bg-brand-50 p-3 text-sm"><b>Decision:</b> {active.decisionNote}</div>}
            {err && <Alert>{err}</Alert>}
            {(step === 'verify' || step === 'decide') && (
              <form className="space-y-3 border-t border-line pt-4">
                <label className="block"><span className="label">{step === 'verify' ? 'Your check of the evidence' : 'Your decision'}</span>
                  <textarea className="field min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="The customer will see this note." /></label>
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="btn-ghost text-rose-600" disabled={busy} onClick={(e) => review(e, false)}>{step === 'verify' ? 'Reject complaint' : 'Decline'}</button>
                  <button className="btn-primary" disabled={busy} onClick={(e) => review(e, true)}>{step === 'verify' ? 'Verify complaint' : active.resolution === 'REPLACEMENT' ? 'Approve replacement' : 'Approve refund'}</button>
                </div>
              </form>
            )}
            {step === 'send' && <div className="flex justify-end border-t border-line pt-4"><button className="btn-primary" disabled={busy} onClick={sent}>Mark replacement as sent</button></div>}
            {!step && <p className="border-t border-line pt-3 text-xs text-mute">Nothing for your role to do on this request right now.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
