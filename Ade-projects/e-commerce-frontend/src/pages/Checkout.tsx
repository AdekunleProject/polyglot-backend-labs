import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createOrder } from '../api/orders';
import { useCart } from '../context/CartContext';
import { extractErrorMessage } from '../api/client';
import type { ShippingAddress } from '../types';

const emptyAddress: ShippingAddress = {
  fullName: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  phoneNumber: '',
};

export default function Checkout() {
  const [address, setAddress] = useState<ShippingAddress>(emptyAddress);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { refresh } = useCart();
  const navigate = useNavigate();

  const update = (field: keyof ShippingAddress) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddress((a) => ({ ...a, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const order = await createOrder(address);
      await refresh();
      navigate(`/orders/${order._id}/pay`, { state: { justPlaced: true } });
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not place this order.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <p className="label-eyebrow mb-2">Delivery Details</p>
      <h1 className="text-4xl sm:text-5xl font-800 mb-8">Checkout</h1>

      <form onSubmit={handleSubmit} className="ticket p-6 sm:p-8 space-y-4">
        <Field label="Full name" value={address.fullName} onChange={update('fullName')} required />
        <Field label="Address line 1" value={address.line1} onChange={update('line1')} required />
        <Field label="Address line 2 (optional)" value={address.line2 ?? ''} onChange={update('line2')} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="City" value={address.city} onChange={update('city')} required />
          <Field label="State / Province" value={address.state} onChange={update('state')} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Postal code" value={address.postalCode} onChange={update('postalCode')} required />
          <Field label="Country" value={address.country} onChange={update('country')} required />
        </div>
        <Field label="Phone number (optional)" value={address.phoneNumber ?? ''} onChange={update('phoneNumber')} />

        {error && <p className="text-warnred font-mono text-sm">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Placing order…' : 'Place Order'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="label-eyebrow block mb-1">{label}</label>
      <input className="input-field" value={value} onChange={onChange} required={required} />
    </div>
  );
}
