import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { extractErrorMessage } from '../api/client';
import GoogleButton from '../components/GoogleButton';
import AuthSidePanel from '../components/AuthSidePanel';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstname: '',
    lastname: '',
    email: '',
    password: '',
    phoneNumber: '',
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await signup(form);
      setMessage(res.message || 'Account created. Please check your email to verify.');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not create that account.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 min-h-[calc(100vh-8rem)]">
      <AuthSidePanel
        heading="Join Duka today"
        subheading="Create an account to order from thousands of products, all in one place."
      />

      <div className="flex items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="label-eyebrow mb-2">Sign Up</p>
          <h1 className="text-3xl font-display font-800 mb-8">Create Account</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-eyebrow block mb-1">First name</label>
                <input required className="input-field" value={form.firstname} onChange={update('firstname')} />
              </div>
              <div>
                <label className="label-eyebrow block mb-1">Last name</label>
                <input required className="input-field" value={form.lastname} onChange={update('lastname')} />
              </div>
            </div>
            <div>
              <label className="label-eyebrow block mb-1">Email</label>
              <input type="email" required className="input-field" value={form.email} onChange={update('email')} />
            </div>
            <div>
              <label className="label-eyebrow block mb-1">Password</label>
              <input
                type="password"
                required
                minLength={8}
                className="input-field"
                value={form.password}
                onChange={update('password')}
              />
            </div>
            <div>
              <label className="label-eyebrow block mb-1">Phone (optional)</label>
              <input className="input-field" value={form.phoneNumber} onChange={update('phoneNumber')} />
            </div>

            {error && <p className="text-warnred text-sm">{error}</p>}
            {message && <p className="text-okgreen text-sm">{message}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Creating account…' : 'Create Account'}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="flex-1 dashed-rule" />
              <span className="label-eyebrow">Or</span>
              <span className="flex-1 dashed-rule" />
            </div>

            <GoogleButton label="Sign up with Google" />
          </form>

          <p className="text-sm text-inkfaint mt-6 text-center">
            Already registered?{' '}
            <Link to="/login" className="text-rust hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
