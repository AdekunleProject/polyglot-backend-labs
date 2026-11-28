import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LuLock } from 'react-icons/lu';
import { api, errorMessage } from '../api/client';
import { LogoMark } from '../components/Logo';
import { Alert, Spinner } from '../components/ui';

/** A stand-in for the Paystack hosted checkout, shown only in demo mode. */
export default function DemoPaystack() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const reference = sp.get('reference') ?? '';
  const [busy, setBusy] = useState<'success' | 'fail' | null>(null);
  const [error, setError] = useState('');

  const charge = async (outcome: 'success' | 'fail') => {
    setBusy(outcome); setError('');
    try {
      await api.post('/demo/charge', { reference, outcome });
      nav(`/payment/return?reference=${encodeURIComponent(reference)}`, { replace: true });
    } catch (e) { setError(errorMessage(e)); setBusy(null); }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-night-900 p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-lift">
        <div className="flex items-center justify-between bg-brand-gradient p-5 text-white">
          <div className="flex items-center gap-2 font-display font-bold"><LogoMark size={28} /> Test checkout</div>
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold">DEMO</span>
        </div>
        <div className="space-y-4 p-6">
          <Alert tone="info">This is a pretend payment page. No card is charged and nothing leaves your browser.</Alert>
          <div className="rounded-xl border border-line p-4 text-sm"><p className="text-mute">Reference</p><p className="font-mono text-xs">{reference}</p></div>
          <div className="space-y-3 opacity-70"><input className="field" value="4084 0840 8408 4081" readOnly aria-label="Test card number" /><div className="grid grid-cols-2 gap-3"><input className="field" value="12 / 30" readOnly aria-label="Expiry" /><input className="field" value="408" readOnly aria-label="CVV" /></div></div>
          {error && <Alert>{error}</Alert>}
          <button className="btn-primary w-full" disabled={!!busy} onClick={() => charge('success')}>{busy === 'success' ? <Spinner /> : <LuLock />} Pay now</button>
          <button className="btn-ghost w-full" disabled={!!busy} onClick={() => charge('fail')}>Simulate a failed payment</button>
        </div>
      </div>
    </div>
  );
}
