import { useEffect, useState } from 'react';
import { getAllPayments, approveTransfer, refundPayment } from '../../api/payments';
import type { Payment } from '../../api/payments';
import { extractErrorMessage } from '../../api/client';

const statusColor: Record<string, string> = {
  PENDING: 'text-inkfaint border-inkfaint',
  AWAITING_CONFIRMATION: 'text-rust border-rust',
  PAID: 'text-okgreen border-okgreen',
  FAILED: 'text-warnred border-warnred',
  REFUNDED: 'text-steel border-steel',
};

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getAllPayments()
      .then(setPayments)
      .catch((err) => setError(extractErrorMessage(err, 'Could not load payments.')))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleApprove = async (paymentId: string) => {
    setBusyId(paymentId);
    try {
      await approveTransfer(paymentId);
      load();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not approve that transfer.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRefund = async (paymentId: string) => {
    if (!confirm('Refund this payment in full?')) return;
    setBusyId(paymentId);
    try {
      await refundPayment(paymentId);
      load();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not refund that payment.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl uppercase mb-4">All Payments ({payments.length})</h2>
      {error && <p className="text-warnred font-mono text-sm mb-3">{error}</p>}
      {loading ? (
        <p className="label-eyebrow">Loading&hellip;</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p._id} className="ticket p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="sku">{p.transactionReference}</p>
                <p className="font-mono text-xs text-inkfaint">{p.provider.replace('_', ' ')}</p>
              </div>
              <p className="font-mono font-semibold">
                {p.currency} {p.amount.toFixed(2)}
              </p>
              {p.provider === 'BANK_TRANSFER' && (p.receipt || p.receiptUrl) && (
                <a
                  href={p.receipt || p.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="label-eyebrow text-steel hover:underline"
                >
                  View Receipt
                </a>
              )}
              <span className={`stamp inline-block ${statusColor[p.status] ?? 'text-inkfaint border-inkfaint'}`}>
                {p.status}
              </span>
              <div className="flex gap-2">
                {p.provider === 'BANK_TRANSFER' && p.status === 'AWAITING_CONFIRMATION' && (
                  <button
                    disabled={busyId === p._id}
                    onClick={() => handleApprove(p._id)}
                    className="btn-secondary !py-1.5 !px-3 !text-xs"
                  >
                    Approve
                  </button>
                )}
                {p.status === 'PAID' && (
                  <button
                    disabled={busyId === p._id}
                    onClick={() => handleRefund(p._id)}
                    className="label-eyebrow text-warnred hover:underline"
                  >
                    Refund
                  </button>
                )}
              </div>
            </div>
          ))}
          {!loading && payments.length === 0 && <p className="label-eyebrow">No transactions on record.</p>}
        </div>
      )}
    </div>
  );
}
