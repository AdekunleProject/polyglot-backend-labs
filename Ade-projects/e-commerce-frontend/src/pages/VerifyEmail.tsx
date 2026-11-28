import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resendVerification, verifyEmail } from '../api/auth';
import { errorMessage } from '../api/client';
import { Alert, Field, Spinner } from '../components/ui';
import { AuthShell } from '../components/AuthShell';
import { useToast } from '../context/ToastContext';

export default function VerifyEmail() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState(sp.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from your email.'); return; }
    setBusy(true); setError('');
    try { await verifyEmail(email.trim(), code); toast.success('Email verified. You can sign in now.'); nav('/login', { replace: true }); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  const resend = async () => {
    try { await resendVerification(email.trim()); setSent(true); toast.info('A new code is on its way.'); } catch (err) { setError(errorMessage(err)); }
  };

  return (
    <AuthShell title="Check your email" subtitle="We sent a 6-digit code. It expires in 10 minutes." footer={<Link to="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        {sent && <Alert tone="success">A new code was sent if that account exists.</Alert>}
        <Field label="Email"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Verification code"><input className="field text-center font-mono text-xl tracking-[0.5em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" autoFocus /></Field>
        <button className="btn-primary btn-lg w-full" disabled={busy}>{busy && <Spinner />} Verify email</button>
        <button type="button" onClick={resend} className="w-full text-sm font-semibold text-brand-600 hover:underline" disabled={!email}>Send a new code</button>
      </form>
    </AuthShell>
  );
}
