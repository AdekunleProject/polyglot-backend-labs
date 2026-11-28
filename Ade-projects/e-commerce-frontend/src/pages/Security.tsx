import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuKeyRound, LuShieldCheck, LuUser } from 'react-icons/lu';
import { changePassword, fetchProfile, twoFactorDisable, twoFactorEnable, twoFactorSetup, updateProfile } from '../api/auth';
import { errorMessage } from '../api/client';
import { Alert, Field, PageLoader, Spinner, useAsync } from '../components/ui';
import { PasswordInput, PasswordRules, passwordOk } from '../components/AuthShell';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { dateShort, ROLE_LABEL } from '../lib/format';
import { ShareButton } from '../components/Share';
import { appUrl } from '../lib/url';
import type { Profile } from '../types';

export default function Security() {
  const { user, refreshUser } = useAuth();
  const profile = useAsync(fetchProfile, []);
  const toast = useToast();
  const nav = useNavigate();

  if (profile.loading) return <PageLoader />;
  const p = profile.data;

  return (
    <div className="container-x max-w-4xl py-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Profile & security</h1>
        {p && <ShareButton label="Share my profile" target={{ title: 'Harlim ShopAll', text: `${p.firstname} ${p.lastname} invites you to shop on Harlim ShopAll.`, url: appUrl('/') }} />}
      </div>
      <p className="mb-6 mt-1 text-mute">{p ? `${ROLE_LABEL[p.role]} · member since ${dateShort(p.createdAt)}` : ''}</p>
      {user?.restriction === 'change-password' && <div className="mb-6"><Alert tone="info">Your account was created with a temporary password. Choose a new one to continue.</Alert></div>}
      {user?.restriction === 'two-factor' && <div className="mb-6"><Alert tone="info">Staff accounts must use two-step verification. Turn it on below to continue.</Alert></div>}
      <div className="space-y-6">
        {p && user?.role === 'customer' && <ProfileForm profile={p} onSaved={() => { toast.success('Profile saved.'); profile.reload(); void refreshUser(); }} />}
        <PasswordForm onDone={async () => { toast.success('Password changed.'); await refreshUser(); if (user?.restriction) nav('/'); }} />
        <TwoFactor enabled={!!p?.twoFactorEnabled} onChanged={async () => { profile.reload(); await refreshUser(); }} />
      </div>
    </div>
  );
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [f, setF] = useState({ firstname: profile.firstname, middlename: profile.middlename ?? '', lastname: profile.lastname, phoneNumber: profile.phoneNumber ?? '', address: profile.address ?? '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.middlename && !/^[A-Za-z]+$/.test(f.middlename)) { setError('Middle name must be letters only.'); return; }
    setBusy(true); setError('');
    try { await updateProfile({ firstname: f.firstname, lastname: f.lastname, middlename: f.middlename || undefined, phoneNumber: f.phoneNumber, address: f.address }); onSaved(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card-pad space-y-4" noValidate>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold"><LuUser className="text-brand-600" /> Personal details</h2>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3"><Field label="First name"><input className="field" value={f.firstname} onChange={set('firstname')} /></Field><Field label="Middle name"><input className="field" value={f.middlename} onChange={set('middlename')} /></Field><Field label="Last name"><input className="field" value={f.lastname} onChange={set('lastname')} /></Field></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Email" hint="Contact support to change your email."><input className="field bg-slate-50" value={profile.email} readOnly /></Field><Field label="Phone"><input className="field" type="tel" value={f.phoneNumber} onChange={set('phoneNumber')} /></Field></div>
      <Field label="Address"><input className="field" value={f.address} onChange={set('address')} /></Field>
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy && <Spinner />} Save changes</button></div>
    </form>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!cur) { setError('Enter your current password.'); return; }
    if (!passwordOk(pw)) { setError('The new password does not meet the rules.'); return; }
    if (pw !== again) { setError('The new passwords do not match.'); return; }
    setBusy(true); setError('');
    try { await changePassword(cur, pw); setCur(''); setPw(''); setAgain(''); onDone(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="card-pad space-y-4" noValidate>
      <h2 className="flex items-center gap-2 font-display text-lg font-bold"><LuKeyRound className="text-brand-600" /> Change password</h2>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password"><PasswordInput value={cur} onChange={setCur} autoComplete="current-password" /></Field>
        <Field label="New password"><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" /></Field>
        <Field label="Confirm new"><PasswordInput value={again} onChange={setAgain} autoComplete="new-password" /></Field>
      </div>
      <PasswordRules value={pw} />
      <div className="flex justify-end"><button className="btn-primary" disabled={busy}>{busy && <Spinner />} Update password</button></div>
    </form>
  );
}

function TwoFactor({ enabled, onChanged }: { enabled: boolean; onChanged: () => void | Promise<void> }) {
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState<string[] | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setError(''); setCode(''); }, [enabled]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } };

  return (
    <section className="card-pad space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold"><LuShieldCheck className="text-brand-600" /> Two-step verification</h2>
        <span className={enabled ? 'badge-green' : 'badge-gray'}>{enabled ? 'On' : 'Off'}</span>
      </div>
      <p className="text-sm text-mute">Use an authenticator app such as Google Authenticator or Authy. Each sign-in then needs a 6-digit code.</p>
      {error && <Alert>{error}</Alert>}
      {backup && (
        <Alert tone="success"><p className="font-semibold">Two-step verification is on. Save these backup codes somewhere safe:</p><p className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-4">{backup.map((c) => <span key={c}>{c}</span>)}</p></Alert>
      )}
      {!enabled && !setup && <button className="btn-primary" disabled={busy} onClick={() => run(async () => setSetup(await twoFactorSetup()))}>{busy && <Spinner />} Set up</button>}
      {!enabled && setup && (
        <div className="grid gap-5">
          <div className="space-y-3">
            <p className="text-sm">In your authenticator app choose “Enter a setup key” and paste this key. On a phone you can also <a className="font-semibold text-brand-600 underline" href={setup.otpauthUrl}>open it directly in your app</a>.</p>
            <code className="block break-all rounded-lg bg-brand-50 px-3 py-2 font-mono text-sm">{setup.secret}</code>
            <Field label="Enter the 6-digit code"><input className="field font-mono tracking-widest" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
            <button className="btn-primary" disabled={busy || code.length !== 6} onClick={() => run(async () => { const r = await twoFactorEnable(code); setBackup(r.recoveryCodes ?? null); setSetup(null); toast.success('Two-step verification is on.'); await onChanged(); })}>{busy && <Spinner />} Turn on</button>
          </div>
        </div>
      )}
      {enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Authenticator code"><input className="field font-mono tracking-widest" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Your password"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" /></Field>
          <div className="sm:col-span-2"><button className="btn-danger" disabled={busy || code.length !== 6} onClick={() => run(async () => { await twoFactorDisable(code, password || undefined); toast.info('Two-step verification is off.'); setBackup(null); await onChanged(); })}>{busy && <Spinner />} Turn off</button></div>
        </div>
      )}
    </section>
  );
}
