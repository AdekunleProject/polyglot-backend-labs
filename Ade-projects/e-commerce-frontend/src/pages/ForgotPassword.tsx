import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPassword, resetPassword, verifyResetCode } from '../api/auth';
import { errorMessage } from '../api/client';
import { Alert, Field, Spinner } from '../components/ui';
import { AuthShell, PasswordInput, PasswordRules, passwordOk } from '../components/AuthShell';
import { useToast } from '../context/ToastContext';

/** Three steps, matching the API: ask for a code, prove it, then set a new password within 10 minutes. */
export default function ForgotPassword() {
  const nav = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };

  const one = (e: FormEvent) => { e.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) { setError('Enter a valid email.'); return; } void run(async () => { const r = await forgotPassword(email.trim()); setInfo(r.message); setStep(2); }); };
  const two = (e: FormEvent) => { e.preventDefault(); if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code.'); return; } void run(async () => { await verifyResetCode(email.trim(), code); setInfo(''); setStep(3); }); };
  const three = (e: FormEvent) => {
    e.preventDefault();
    if (!passwordOk(pw)) { setError('Password does not meet the rules below.'); return; }
    if (pw !== confirm) { setError('Passwords do not match.'); return; }
    void run(async () => { await resetPassword(pw, confirm); toast.success('Password updated. Sign in with your new password.'); nav('/login', { replace: true }); });
  };

  const titles = { 1: ['Forgot your password?', 'Enter your email and we will send a reset code.'], 2: ['Enter the code', `We sent a 6-digit code to ${email}.`], 3: ['Choose a new password', 'You have 10 minutes to finish this step.'] } as const;

  return (
    <AuthShell title={titles[step][0]} subtitle={titles[step][1]} footer={<Link to="/login" className="font-semibold text-brand-600 hover:underline">Back to sign in</Link>}>
      <div className="mb-6 flex gap-2" aria-label={`Step ${step} of 3`}>{[1, 2, 3].map((n) => <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-brand-gradient' : 'bg-line'}`} />)}</div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {info && step === 2 && <div className="mb-4"><Alert tone="info">{info}</Alert></div>}
      {step === 1 && <form onSubmit={one} className="space-y-5" noValidate><Field label="Email"><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus /></Field><button className="btn-primary btn-lg w-full" disabled={busy}>{busy && <Spinner />} Send code</button></form>}
      {step === 2 && <form onSubmit={two} className="space-y-5" noValidate><Field label="Reset code"><input className="field text-center font-mono text-xl tracking-[0.5em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus autoComplete="one-time-code" /></Field><button className="btn-primary btn-lg w-full" disabled={busy}>{busy && <Spinner />} Continue</button><button type="button" className="w-full text-sm font-semibold text-brand-600 hover:underline" onClick={() => { setStep(1); setError(''); }}>Use a different email</button></form>}
      {step === 3 && <form onSubmit={three} className="space-y-4" noValidate><Field label="New password"><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" /></Field><PasswordRules value={pw} /><Field label="Confirm new password"><PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" /></Field><button className="btn-primary btn-lg w-full" disabled={busy}>{busy && <Spinner />} Update password</button></form>}
    </AuthShell>
  );
}
