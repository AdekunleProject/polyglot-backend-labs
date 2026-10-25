import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth';
import { extractErrorMessage } from '../api/client';
import AuthSidePanel from '../components/AuthSidePanel';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await forgotPassword(email);
      setMessage(res.message || 'If that email is registered, a reset link has been sent.');
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not send a reset link right now.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 min-h-[calc(100vh-8rem)]">
      <AuthSidePanel
        heading="Forgot your password?"
        subheading="We'll email you a link to set a new one."
      />

      <div className="flex items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="label-eyebrow mb-2">Password Reset</p>
          <h1 className="text-3xl font-display font-800 mb-8">Reset Password</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-eyebrow block mb-1">Email</label>
              <input
                type="email"
                required
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {message && <p className="text-okgreen text-sm">{message}</p>}
            {error && <p className="text-warnred text-sm">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>

          <p className="text-sm text-inkfaint mt-6 text-center">
            Remembered it?{' '}
            <Link to="/login" className="text-rust hover:underline font-medium">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
