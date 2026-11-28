import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LuCircleCheck, LuCircleX, LuClock } from 'react-icons/lu';
import { verifyPayment } from '../api/shop';
import { errorMessage } from '../api/client';
import { Spinner } from '../components/ui';

export default function PaymentReturn() {
  const [sp] = useSearchParams();
  const reference = sp.get('reference') || sp.get('trxref') || '';
  const [state, setState] = useState<'checking' | 'paid' | 'failed' | 'unknown'>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!reference) { setState('unknown'); setMessage('We could not find a payment reference in this link.'); return; }
    let tries = 0;
    let alive = true;
    const check = async () => {
      try {
        const r = await verifyPayment(reference);
        if (!alive) return;
        const s = String(r.status ?? '').toUpperCase();
        if (s === 'PAID' || s === 'SUCCESS') { setState('paid'); return; }
        if (s === 'FAILED') { setState('failed'); setMessage('The payment was not completed.'); return; }
        if (++tries < 4) setTimeout(check, 2500); else { setState('unknown'); setMessage('We have not received confirmation yet. It can take a minute. Check your orders shortly.'); }
      } catch (e) { if (alive) { setState('unknown'); setMessage(errorMessage(e)); } }
    };
    void check();
    return () => { alive = false; };
  }, [reference]);

  const view = {
    checking: { icon: <Spinner className="text-4xl text-brand-600" />, title: 'Confirming your payment', tone: 'bg-brand-50' },
    paid: { icon: <LuCircleCheck className="text-5xl text-emerald-500" />, title: 'Payment received', tone: 'bg-emerald-50' },
    failed: { icon: <LuCircleX className="text-5xl text-rose-500" />, title: 'Payment not completed', tone: 'bg-rose-50' },
    unknown: { icon: <LuClock className="text-5xl text-amber-500" />, title: 'Still waiting', tone: 'bg-amber-50' },
  }[state];

  return (
    <div className="container-x grid min-h-[60vh] place-items-center py-12">
      <div className="card-pad w-full max-w-md text-center">
        <div className={`mx-auto mb-5 grid h-24 w-24 place-items-center rounded-full ${view.tone}`}>{view.icon}</div>
        <h1 className="font-display text-2xl font-extrabold">{view.title}</h1>
        {state === 'paid' && <p className="mt-2 text-mute">Thank you. We are getting your order ready. Reference <span className="font-mono text-xs">{reference}</span></p>}
        {message && <p className="mt-2 text-mute">{message}</p>}
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/orders" className="btn-primary">View my orders</Link>
          <Link to="/shop" className="btn-ghost">Keep shopping</Link>
        </div>
      </div>
    </div>
  );
}
