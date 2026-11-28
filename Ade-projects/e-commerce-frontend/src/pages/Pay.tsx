import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { LuCheck, LuCopy, LuCreditCard, LuLandmark, LuLock } from 'react-icons/lu';
import { confirmBankTransfer, getMyOrder, initializeBankTransfer, initializePayment } from '../api/shop';
import { errorMessage } from '../api/client';
import { Alert, Breadcrumb, ErrorState, Field, PageLoader, Spinner, useAsync } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { money, moneyExact } from '../lib/format';
import { appUrl } from '../lib/url';

type Transfer = Awaited<ReturnType<typeof initializeBankTransfer>>;

export default function Pay() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const order = useAsync(() => getMyOrder(id), [id]);
  const [method, setMethod] = useState<'card' | 'transfer'>('card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  if (order.loading) return <PageLoader label="Preparing payment" />;
  if (order.error || !order.data) return <div className="container-x py-12"><ErrorState error={order.error} onRetry={order.reload} /></div>;
  const o = order.data;
  if (o.paymentStatus === 'paid') return <Navigate to={`/orders/${o._id}`} replace />;

  const payCard = async () => {
    setBusy(true); setError('');
    try {
      const r = await initializePayment(o._id, appUrl('/payment/return'));
      window.location.href = r.authorizationUrl;
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  const startTransfer = async () => {
    setBusy(true); setError('');
    try { setTransfer(await initializeBankTransfer(o._id)); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const sendReceipt = async () => {
    if (!transfer) return;
    if (!receiptUrl.trim() && !file) { setError('Add a link to your receipt or upload a photo of it.'); return; }
    setBusy(true); setError('');
    try {
      await confirmBankTransfer(transfer.paymentId, receiptUrl.trim(), file);
      toast.success('Receipt received. We will confirm your payment shortly.');
      nav(`/orders/${o._id}`, { replace: true });
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const copy = (text: string) => { navigator.clipboard?.writeText(text).then(() => toast.info('Copied.')).catch(() => undefined); };

  const opt = (key: 'card' | 'transfer', icon: React.ReactNode, title: string, text: string) => (
    <button type="button" onClick={() => { setMethod(key); setError(''); }} aria-pressed={method === key}
      className={`flex w-full items-start gap-4 rounded-2xl border-2 p-5 text-left transition ${method === key ? 'border-brand-600 bg-brand-50/60 shadow-soft' : 'border-line bg-white hover:border-brand-300'}`}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl ${method === key ? 'bg-brand-gradient text-white' : 'bg-brand-50 text-brand-600'}`}>{icon}</span>
      <span><span className="block font-display font-bold">{title}</span><span className="text-sm text-mute">{text}</span></span>
    </button>
  );

  return (
    <div className="container-x max-w-4xl py-8 sm:py-10">
      <Breadcrumb items={[{ label: 'Orders', to: '/orders' }, { label: 'Order', to: `/orders/${o._id}` }, { label: 'Payment' }]} />
      <h1 className="mb-6 font-display text-3xl font-extrabold">Pay for your order</h1>
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}
          {!transfer ? (
            <>
              {opt('card', <LuCreditCard />, 'Pay with card', 'Secure checkout by Paystack. Your order is confirmed instantly.')}
              {opt('transfer', <LuLandmark />, 'Bank transfer', 'Send the exact amount, then share your receipt. We confirm within a few hours.')}
              <button className="btn-primary btn-lg w-full" disabled={busy} onClick={method === 'card' ? payCard : startTransfer}>
                {busy ? <Spinner /> : <LuLock />} {method === 'card' ? `Pay ${money(o.total)}` : 'Show bank details'}
              </button>
            </>
          ) : (
            <div className="card-pad space-y-5">
              <h2 className="font-display text-xl font-bold">Transfer {moneyExact(transfer.amount)}</h2>
              <dl className="divide-y divide-line rounded-xl border border-line text-sm">
                {[['Bank', transfer.bankName], ['Account name', transfer.accountName], ['Account number', transfer.accountNumber], ['Reference', transfer.reference]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-3"><dt className="text-mute">{k}</dt><dd className="flex items-center gap-2 font-semibold">{v}<button onClick={() => copy(String(v))} aria-label={`Copy ${k}`} className="text-brand-600"><LuCopy /></button></dd></div>
                ))}
              </dl>
              <Alert tone="info">Use the reference above as your transfer narration so we can match it quickly.</Alert>
              <Field label="Link to your receipt" hint="Or upload a photo of it below."><input className="field" placeholder="https://…" value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} /></Field>
              <Field label="Receipt photo (optional)"><input className="field" type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
              <button className="btn-primary btn-lg w-full" disabled={busy} onClick={sendReceipt}>{busy ? <Spinner /> : <LuCheck />} I have paid, send receipt</button>
            </div>
          )}
        </div>
        <aside className="card-pad h-fit">
          <h2 className="font-display font-bold">Order summary</h2>
          <ul className="mt-3 space-y-2 text-sm">{o.items.map((i) => <li key={i.variantId} className="flex justify-between gap-3"><span className="truncate">{i.quantity} × {i.productName}</span><span className="font-semibold">{money(i.totalPrice)}</span></li>)}</ul>
          <div className="mt-4 flex justify-between border-t border-line pt-3"><span className="font-bold">Total</span><span className="font-display text-xl font-extrabold gradient-text">{money(o.total)}</span></div>
          <Link to={`/orders/${o._id}`} className="mt-4 block text-center text-sm font-semibold text-brand-600 hover:underline">Pay later</Link>
        </aside>
      </div>
    </div>
  );
}
