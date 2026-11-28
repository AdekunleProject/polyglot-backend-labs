import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signup } from '../api/auth';
import { errorMessage } from '../api/client';
import { Alert, Field, Spinner } from '../components/ui';
import { AuthShell, PasswordInput, PasswordRules, passwordOk } from '../components/AuthShell';
import { useToast } from '../context/ToastContext';

type F = Record<'firstname' | 'middlename' | 'lastname' | 'email' | 'phoneNumber' | 'dateOfBirth' | 'gender' | 'address' | 'password' | 'confirm', string>;
const EMPTY: F = { firstname: '', middlename: '', lastname: '', email: '', phoneNumber: '+234', dateOfBirth: '', gender: '', address: '', password: '', confirm: '' };

export default function Signup() {
  const nav = useNavigate();
  const toast = useToast();
  const [f, setF] = useState<F>(EMPTY);
  const [errors, setErrors] = useState<Partial<F>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const n: Partial<F> = {};
    if (!/^[A-Za-z]+$/.test(f.firstname)) n.firstname = 'Letters only, no spaces';
    if (f.middlename && !/^[A-Za-z]+$/.test(f.middlename)) n.middlename = 'Letters only, no spaces';
    if (!/^[A-Za-z]+$/.test(f.lastname)) n.lastname = 'Letters only, no spaces';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) n.email = 'Enter a valid email';
    if (!/^\+[1-9]\d{7,14}$/.test(f.phoneNumber.replace(/\s/g, ''))) n.phoneNumber = 'Use international format, e.g. +2348012345678';
    if (!f.dateOfBirth) n.dateOfBirth = 'Choose your date of birth';
    if (!f.gender) n.gender = 'Choose one';
    if (!f.address.trim()) n.address = 'Enter your address';
    if (!passwordOk(f.password)) n.password = 'Password does not meet the rules below';
    if (f.confirm !== f.password) n.confirm = 'Passwords do not match';
    setErrors(n);
    if (Object.keys(n).length) return;
    setBusy(true); setError('');
    try {
      const r = await signup({ firstname: f.firstname, middlename: f.middlename || undefined, lastname: f.lastname, email: f.email.trim(), password: f.password, phoneNumber: f.phoneNumber.replace(/\s/g, ''), dateOfBirth: f.dateOfBirth, gender: f.gender, address: f.address.trim() });
      toast.success(r.message);
      nav(`/verify-email?email=${encodeURIComponent(f.email.trim())}`, { replace: true });
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <AuthShell title="Create your account" subtitle="It takes a minute. We will email you a code to confirm your address." footer={<>Already have an account? <Link to="/login" className="font-semibold text-brand-600 hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.firstname}><input className="field" value={f.firstname} onChange={set('firstname')} autoComplete="given-name" /></Field>
          <Field label="Last name" error={errors.lastname}><input className="field" value={f.lastname} onChange={set('lastname')} autoComplete="family-name" /></Field>
        </div>
        <Field label="Middle name (optional)" error={errors.middlename}><input className="field" value={f.middlename} onChange={set('middlename')} autoComplete="additional-name" /></Field>
        <Field label="Email" error={errors.email}><input className="field" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" error={errors.phoneNumber}><input className="field" type="tel" value={f.phoneNumber} onChange={set('phoneNumber')} autoComplete="tel" /></Field>
          <Field label="Date of birth" error={errors.dateOfBirth}><input className="field" type="date" max={new Date().toISOString().slice(0, 10)} value={f.dateOfBirth} onChange={set('dateOfBirth')} autoComplete="bday" /></Field>
        </div>
        <Field label="Gender" error={errors.gender}>
          <select className="field" value={f.gender} onChange={set('gender')}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select>
        </Field>
        <Field label="Address" error={errors.address}><input className="field" value={f.address} onChange={set('address')} autoComplete="street-address" /></Field>
        <Field label="Password" error={errors.password}><PasswordInput value={f.password} onChange={(v) => setF((x) => ({ ...x, password: v }))} autoComplete="new-password" /></Field>
        <PasswordRules value={f.password} />
        <Field label="Confirm password" error={errors.confirm}><PasswordInput value={f.confirm} onChange={(v) => setF((x) => ({ ...x, confirm: v }))} autoComplete="new-password" /></Field>
        <button className="btn-primary btn-lg w-full" disabled={busy}>{busy && <Spinner />} Create account</button>
      </form>
    </AuthShell>
  );
}
