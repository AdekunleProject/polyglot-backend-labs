import { useEffect, useState } from 'react';
import { getMyPayments, Payment } from '../api/payments';
import { extractErrorMessage } from '../api/client';

const statusColor: Record<string, string> = {
  PENDING: 'text-inkfaint border-inkfaint',
  PAID: 'text-okgreen border-okgreen',
  FAILED: 'text-warnred border-warnred',
  REFUNDED: 'text-steel border-steel',
};

export default function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyPayments()
      .then(setPayments)
      .catch((err) => {
        if (err?.response?.status === 404) setPayments([]);
        else setError(extractErrorMessage(err, 'Could not load payment records.'));
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      <p className="label-eyebrow mb-2">Payment History</p>
      <h1 className="text-4xl sm:text-5xl font-800 mb-8">Payment Records</h1>

      {loading && <p className="label-eyebrow">Reading ledger&hellip;</p>}
      {error && <p className="text-warnred font-mono text-sm">{error}</p>}

      {!loading && payments.length === 0 && !error && (
        <div className="ticket p-10 text-center">
          <p className="label-eyebrow">No transactions on record yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {payments.map((p) => (
          <div key={p._id} className="ticket p-5 flex items-center justify-between">
            <div>
              <p className="sku mb-1">{p.transactionReference}</p>
              <p className="font-display text-lg uppercase">{p.provider.replace('_', ' ')}</p>
              <p className="font-mono text-xs text-inkfaint">{new Date(p.createdAt).toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-lg font-semibold mb-1">
                {p.currency} {p.amount.toFixed(2)}
              </p>
              <span className={`stamp inline-block ${statusColor[p.status] ?? 'text-inkfaint border-inkfaint'}`}>
                {p.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
