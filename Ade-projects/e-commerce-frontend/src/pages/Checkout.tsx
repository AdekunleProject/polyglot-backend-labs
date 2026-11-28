import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LuLock, LuTruck } from 'react-icons/lu';
import { fetchProfile } from '../api/auth';
import { createOrder } from '../api/shop';
import { errorMessage } from '../api/client';
import { Alert, Field, Spinner } from '../components/ui';
import { ProductImage } from '../components/ProductCard';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { money } from '../lib/format';
import { NG_STATES } from '../lib/ng';
import type { ShippingAddress } from '../types';

export default function Checkout() {
  const { lines, subtotal, loading, reload } = useCart();
  const nav = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<ShippingAddress>({ fullName: '', line1: '', line2: '', city: '', state: 'Lagos', postalCode: '', country: 'Nigeria', phoneNumber: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof ShippingAddress, string>>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchProfile().then((p) => setForm((f) => ({ ...f, fullName: f.fullName || `${p.firstname} ${p.lastname}`, phoneNumber: f.phoneNumber || p.phoneNumber || '', line1: f.line1 || p.address || '' }))).catch(() => undefined);
  }, []);

  if (!loading && lines.length === 0) return <Navigate to="/cart" replace />;
  const set = (k: keyof ShippingAddress) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.fullName.trim().length < 3) next.fullName = 'Enter the full name of the receiver';
    if (!form.line1.trim()) next.line1 = 'Enter a street address';
    if (!form.city.trim()) next.city = 'Enter a city';
    if (!form.postalCode.trim()) next.postalCode = 'Enter a postal code (e.g. 100001)';
    if (form.phoneNumber && !/^\+?[0-9\s-]{7,16}$/.test(form.phoneNumber)) next.phoneNumber = 'Enter a valid phone number';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true); setError('');
    try {
      const body: ShippingAddress = { ...form, line2: form.line2 || undefined, phoneNumber: form.phoneNumber || undefined };
      const order = await createOrder(body);
      await reload();
      toast.success('Order placed. Now choose how to pay.');
      nav(`/orders/${order._id}/pay`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="container-x py-8 sm:py-10">
      <h1 className="mb-6 font-display text-3xl font-extrabold sm:text-4xl">Checkout</h1>
      <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[1fr_400px]">
        <div className="card-pad">
          <h2 className="mb-5 flex items-center gap-2 font-display text-xl font-bold"><LuTruck className="text-brand-600" /> Delivery address</h2>
          {error && <div className="mb-5"><Alert>{error}</Alert></div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Full name" error={errors.fullName}><input className="field" value={form.fullName} onChange={set('fullName')} autoComplete="name" /></Field></div>
            <div className="sm:col-span-2"><Field label="Street address" error={errors.line1}><input className="field" value={form.line1} onChange={set('line1')} autoComplete="address-line1" /></Field></div>
            <div className="sm:col-span-2"><Field label="Apartment, landmark (optional)"><input className="field" value={form.line2} onChange={set('line2')} autoComplete="address-line2" /></Field></div>
            <Field label="City" error={errors.city}><input className="field" value={form.city} onChange={set('city')} autoComplete="address-level2" /></Field>
            <Field label="State"><select className="field" value={form.state} onChange={set('state')}>{NG_STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Postal code" error={errors.postalCode}><input className="field" inputMode="numeric" value={form.postalCode} onChange={set('postalCode')} autoComplete="postal-code" /></Field>
            <Field label="Phone (optional)" error={errors.phoneNumber}><input className="field" type="tel" value={form.phoneNumber} onChange={set('phoneNumber')} autoComplete="tel" /></Field>
          </div>
        </div>

        <aside className="card-pad h-fit lg:sticky lg:top-24">
          <h2 className="font-display text-xl font-bold">Your order</h2>
          <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
            {lines.map((l) => (
              <li key={l.variant._id} className="flex gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50"><ProductImage product={l.product} /></div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.product?.name}</p><p className="text-xs text-mute">Qty {l.quantity} · {Object.values(l.variant.attributes ?? {}).join(' / ')}</p></div>
                <p className="text-sm font-semibold">{money(l.total)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4"><span className="font-bold">Total</span><span className="font-display text-2xl font-extrabold gradient-text">{money(subtotal)}</span></div>
          <button className="btn-primary btn-lg mt-5 w-full" disabled={busy}>{busy ? <Spinner /> : <LuLock />} Place order</button>
          <p className="mt-3 text-center text-xs text-mute">You will choose card or bank transfer next. <Link to="/cart" className="font-semibold text-brand-600 hover:underline">Edit cart</Link></p>
        </aside>
      </form>
    </div>
  );
}
