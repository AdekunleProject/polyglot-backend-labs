import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getMyPayments, Payment } from '../api/payments';

// Paystack redirects the browser back here after checkout (configure this
// route as the payment's callback_url — see README). Actual confirmation
// happens server-side via Paystack's webhook, so this page polls the
// customer's payment records until the matching reference shows PAID
// (or FAILED), rather than trying to verify anything itself — the verify
// endpoint on the backend is admin-only.
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 15;

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const reference = params.get('reference') ?? params.get('trxref');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!reference) {
      setError('No payment reference was returned.');
      return;
    }

    let cancelled = false;

    const poll = async () => {
      try {
        const payments = await getMyPayments();
        const match = payments.find((p) => p.transactionReference === reference) ?? null;
        if (cancelled) return;
        setPayment(match);
        if (!match || match.status === 'PENDING') {
          setPollCount((c) => c + 1);
        }
      } catch {
        if (!cancelled) setError('Could not check payment status.');
      }
    };

    poll();
    const interval = setInterval(() => {
      if (pollCount >= MAX_POLLS) return;
      poll();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const stillPending = !payment || payment.status === 'PENDING';
  const timedOut = pollCount >= MAX_POLLS && stillPending;

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24 text-center">
      <div className="ticket p-8">
        <p className="label-eyebrow mb-4">Payment Confirmation</p>

        {error ? (
          <p className="text-warnred font-mono text-sm">{error}</p>
        ) : timedOut ? (
          <>
            <p className="font-mono text-sm mb-4">
              Still waiting on confirmation from the payment provider. This can take a minute — check your
              payment records shortly.
            </p>
            <Link to="/payments" className="btn-secondary inline-block">
              View Payment Records
            </Link>
          </>
        ) : stillPending ? (
          <p className="label-eyebrow">Confirming your payment&hellip;</p>
        ) : payment?.status === 'PAID' ? (
          <>
            <p className="stamp inline-block border-okgreen text-okgreen mb-4">Paid</p>
            <p className="font-mono text-sm mb-4">Payment confirmed. Your order is being processed.</p>
            <Link to="/orders" className="btn-primary inline-block">
              View My Orders
            </Link>
          </>
        ) : (
          <>
            <p className="stamp inline-block border-warnred text-warnred mb-4">{payment?.status}</p>
            <p className="font-mono text-sm mb-4">This payment did not complete successfully.</p>
            <Link to="/orders" className="btn-secondary inline-block">
              Back to Orders
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
