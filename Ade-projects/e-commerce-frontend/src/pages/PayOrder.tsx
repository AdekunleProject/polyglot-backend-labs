import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { initializePayment, initializeBankTransfer, confirmBankTransfer } from '../api/payments';
import { extractErrorMessage } from '../api/client';

type Method = 'choose' | 'card' | 'bank';

// Paystack redirects the browser back to this URL once the customer
// finishes on their hosted checkout page.
const CALLBACK_URL = `${window.location.origin}/payments/return`;

export default function PayOrder() {
  const { id: orderId } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const justPlaced = (location.state as { justPlaced?: boolean })?.justPlaced;

  const [method, setMethod] = useState<Method>('choose');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Bank transfer sub-flow
  const [transferInitialized, setTransferInitialized] = useState<{ paymentId?: string; reference?: string } | null>(
    null
  );
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [confirmStatus, setConfirmStatus] = useState('');

  const handleCard = async () => {
    if (!orderId) return;
    setLoading(true);
    setError('');
    try {
      const res = await initializePayment(orderId, CALLBACK_URL);
      window.location.href = res.authorizationUrl;
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not start card payment.'));
      setLoading(false);
    }
  };

  const handleStartBankTransfer = async () => {
    if (!orderId) return;
    setLoading(true);
    setError('');
    try {
      const res = await initializeBankTransfer(orderId);
      setTransferInitialized(res as { paymentId?: string; reference?: string });
      setMethod('bank');
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not start bank transfer.'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const paymentId = transferInitialized?.paymentId;
    if (!paymentId) {
      setError('Missing payment reference — try restarting the bank transfer.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await confirmBankTransfer(paymentId, receiptUrl, receipt);
      setConfirmStatus('Receipt submitted. Our team will verify and approve your transfer shortly.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not submit your transfer confirmation.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 sm:px-6 py-10">
      {justPlaced && (
        <div className="border-2 border-okgreen text-okgreen font-mono text-sm p-3 mb-6">
          Order filed. Settle payment below to release it for shipment.
        </div>
      )}

      <p className="label-eyebrow mb-2">Settle Payment</p>
      <h1 className="text-4xl font-800 mb-8">Pay for Order</h1>

      {error && <p className="text-warnred font-mono text-sm mb-4">{error}</p>}

      {method === 'choose' && (
        <div className="ticket p-6 sm:p-8 space-y-3">
          <button className="btn-primary w-full" disabled={loading} onClick={handleCard}>
            {loading ? 'Redirecting…' : 'Pay by Card (Paystack)'}
          </button>
          <button className="btn-secondary w-full" disabled={loading} onClick={handleStartBankTransfer}>
            {loading ? 'Starting…' : 'Pay by Bank Transfer'}
          </button>
          <button
            className="label-eyebrow text-inkfaint hover:text-ink w-full text-center pt-2"
            onClick={() => navigate(`/orders/${orderId}`)}
          >
            I'll pay later &mdash; view order
          </button>
        </div>
      )}

      {method === 'bank' && (
        <div className="ticket p-6 sm:p-8 space-y-4">
          <p className="label-eyebrow">Bank Transfer Reference</p>
          <p className="sku text-base">{transferInitialized?.reference ?? 'Pending'}</p>
          <p className="text-sm text-inkfaint leading-relaxed">
            Transfer the order total to our account using the reference above, then upload your receipt
            below to flag it for approval.
          </p>

          {confirmStatus ? (
            <p className="text-okgreen font-mono text-sm">{confirmStatus}</p>
          ) : (
            <form onSubmit={handleConfirmTransfer} className="space-y-3">
              <div>
                <label className="label-eyebrow block mb-1">Upload receipt</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                  className="text-xs font-mono"
                />
              </div>
              <div>
                <label className="label-eyebrow block mb-1">Receipt link</label>
                <input
                  type="url"
                  required
                  placeholder="https://…"
                  value={receiptUrl}
                  onChange={(e) => setReceiptUrl(e.target.value)}
                  className="input-field"
                />
                <p className="font-mono text-[11px] text-inkfaint mt-1">
                  The backend records this link separately from the uploaded file above — paste a link to your
                  transfer receipt (e.g. from your banking app) here too.
                </p>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Submitting…' : 'Confirm Transfer'}
              </button>
            </form>
          )}

          <button
            className="label-eyebrow text-inkfaint hover:text-ink w-full text-center pt-2"
            onClick={() => navigate(`/orders/${orderId}`)}
          >
            Done &mdash; view order
          </button>
        </div>
      )}
    </div>
  );
}
