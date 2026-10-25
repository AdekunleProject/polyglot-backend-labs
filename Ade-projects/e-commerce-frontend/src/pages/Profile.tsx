import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getProfile, updateCustomerProfile, CustomerProfile } from '../api/users';
import { extractErrorMessage } from '../api/client';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ firstname: '', lastname: '', phoneNumber: '', address: '' });
  const [avatar, setAvatar] = useState<File | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p);
        setForm({
          firstname: p.firstName ?? '',
          lastname: p.lastName ?? '',
          phoneNumber: p.phoneNumber ?? '',
          address: p.address ?? '',
        });
      })
      .catch((err) => setError(extractErrorMessage(err, 'Could not load your profile.')))
      .finally(() => setLoading(false));
  }, []);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus('');
    setError('');
    try {
      const res = await updateCustomerProfile(form, avatar);
      setStatus(res.message || 'Profile updated.');
      await refreshUser();
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not update your profile.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="max-w-2xl mx-auto px-6 py-24 label-eyebrow">Loading record&hellip;</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <p className="label-eyebrow mb-2">Account Settings</p>
      <h1 className="text-4xl sm:text-5xl font-800 mb-8">Your Profile</h1>

      <form onSubmit={handleSubmit} className="ticket p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-manila/50 overflow-hidden flex items-center justify-center shrink-0">
            {(user?.profileImage || profile?.profileImage) ? (
              <img src={user?.profileImage || profile?.profileImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-2xl">{profile?.firstName?.[0] ?? '?'}</span>
            )}
          </div>
          <div>
            <label className="label-eyebrow block mb-1">Change photo</label>
            <input type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} className="text-xs font-mono" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-eyebrow block mb-1">First name</label>
            <input className="input-field" value={form.firstname} onChange={update('firstname')} />
          </div>
          <div>
            <label className="label-eyebrow block mb-1">Last name</label>
            <input className="input-field" value={form.lastname} onChange={update('lastname')} />
          </div>
        </div>

        <div>
          <label className="label-eyebrow block mb-1">Email</label>
          <input className="input-field opacity-60" value={profile?.email ?? ''} disabled />
        </div>

        <div>
          <label className="label-eyebrow block mb-1">Phone number</label>
          <input className="input-field" value={form.phoneNumber} onChange={update('phoneNumber')} />
        </div>

        <div>
          <label className="label-eyebrow block mb-1">Address</label>
          <input className="input-field" value={form.address} onChange={update('address')} />
        </div>

        {status && <p className="text-okgreen font-mono text-sm">{status}</p>}
        {error && <p className="text-warnred font-mono text-sm">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
