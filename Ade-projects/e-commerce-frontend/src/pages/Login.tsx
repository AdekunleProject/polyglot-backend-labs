import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LuShieldCheck } from 'react-icons/lu';
import { errorMessage, statusOf } from '../api/client';
import { resendVerification } from '../api/auth';
import type { TwoFactorChallenge } from '../api/auth';
import { Alert, Field, Spinner } from '../components/ui';
import { AuthShell, PasswordInput } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { DEMO } from '../demo/server';
import { DEMO_PASSWORD } from '../demo/seed';
import { isStaff } from '../lib/format';
import type { Role } from '../types';

const DEMO_ACCOUNTS = [
  { label: 'Customer', email: 'ada@demo.shop' },
  { label: 'Manager', email: 'manager@demo.shop' },
  { label: 'Admin', email: 'admin@demo.shop' },
  { label: 'Super admin', email: 'super@demo.shop' },
];

export default function Login() {
  const { signIn, signInTwoFactor } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);

  const done = (role: Role) => nav(from ?? (isStaff(role) ? '/admin' : '/'), { replace: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setUnverified(false);
    if (!email.trim() || !password) { setError('Enter your email and password.'); return; }
    setBusy(true);
    try {
      const c = await signIn(email.trim(), password);
      if ('twoFactorRequired' in c) setChallenge(c);
      else done(c.role);
    } catch (err) {
      setError(errorMessage(err));
      if (statusOf(err) === 403 && /verify/i.test(errorMessage(err))) setUnverified(true);
    } finally { setBusy(false); }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true); setError('');
    try { const u = await signInTwoFactor(email.trim(), challenge.challengeToken, code.trim()); done(u.role); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  if (challenge) {
    return (
      <AuthShell title="Two-step verification" subtitle={challenge.message}>
        <form onSubmit={verify} className="space-y-5" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="6-digit code or backup code"><input className="field text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoFocus autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={32} /></Field>
          <button className="btn-primary btn-lg w-full" disabled={busy || code.length < 6}>{busy ? <Spinner /> : <LuShieldCheck />} Verify and sign in</button>
          <button type="button" className="w-full text-sm font-semibold text-brand-600 hover:underline" onClick={() => { setChallenge(null); setCode(''); setError(''); }}>Use a different account</button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to track orders and check out faster." footer={<>New here? <Link to="/signup" className="font-semibold text-brand-600 hover:underline">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        {unverified && <Alert tone="info">Your email is not verified yet. <Link to={`/verify-email?email=${encodeURIComponent(email)}`} className="font-semibold underline" onClick={() => resendVerification(email).catch(() => undefined)}>Enter your code</Link></Alert>}
        <Field label="Email"><input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" /></Field>
        <div className="-mt-2 text-right"><Link to="/forgot-password" className="text-sm font-semibold text-brand-600 hover:underline">Forgot password?</Link></div>
        <button className="btn-primary btn-lg w-full" disabled={busy}>{busy && <Spinner />} Sign in</button>
      </form>
      {DEMO && (
        <div className="mt-7 rounded-2xl border border-dashed border-brand-300 bg-brand-50/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Try a demo account</p>
          <p className="mt-1 text-xs text-mute">Password for all: <code className="rounded bg-white px-1.5 py-0.5 font-mono">{DEMO_PASSWORD}</code> · 2FA code: <code className="rounded bg-white px-1.5 py-0.5 font-mono">123456</code></p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((a) => <button key={a.email} type="button" className="btn-ghost btn-sm" onClick={() => { setEmail(a.email); setPassword(DEMO_PASSWORD); }}>{a.label}</button>)}
          </div>
        </div>
      )}
    </AuthShell>
  );
}
