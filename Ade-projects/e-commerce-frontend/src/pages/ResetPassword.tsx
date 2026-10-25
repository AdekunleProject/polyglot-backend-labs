import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import { extractErrorMessage } from '../api/client';
import AuthSidePanel from '../components/AuthSidePanel';

// Route matches the literal link the backend's forgotPassword() emails:
// `${BASE_URL}/reset-password/:id/:token` — BASE_URL needs to be set to
// this frontend's origin on the backend for that link to land here at all.
export default function ResetPassword() {
  const { id, token } = useParams<{ id: string; token: string }>();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !token) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const res = await resetPassword(id, token, newPassword, confirmPassword);
      setMessage(res.message || 'Password reset successfully.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not reset your password. The link may have expired.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!id || !token) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
        <p className="text-warnred text-sm">This reset link is missing information and can't be used.</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 min-h-[calc(100vh-8rem)]">
      <AuthSidePanel heading="Set a new password" subheading="Choose something you haven't used before." />

      <div className="flex items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="label-eyebrow mb-2">Password Reset</p>
          <h1 className="text-3xl font-display font-800 mb-8">New Password</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-eyebrow block mb-1">New password</label>
              <input
                type="password"
                required
                minLength={8}
                className="input-field"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-[11px] text-inkfaint mt-1">
                8–20 characters, with upper &amp; lower case, a number, and a special character.
              </p>
            </div>
            <div>
              <label className="label-eyebrow block mb-1">Confirm password</label>
              <input
                type="password"
                required
                className="input-field"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {message && <p className="text-okgreen text-sm">{message}</p>}
            {error && <p className="text-warnred text-sm">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Saving…' : 'Reset Password'}
            </button>
          </form>

          <p className="text-sm text-inkfaint mt-6 text-center">
            <Link to="/login" className="text-rust hover:underline font-medium">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
