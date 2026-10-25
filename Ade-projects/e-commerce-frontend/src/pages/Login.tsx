import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { extractErrorMessage } from '../api/client';
import GoogleButton from '../components/GoogleButton';
import AuthSidePanel from '../components/AuthSidePanel';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err, 'Could not sign in with those credentials.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 min-h-[calc(100vh-8rem)]">
      <AuthSidePanel
        heading="Welcome back to Duka"
        subheading="Sign in to track orders, manage your cart, and check out faster."
      />

      <div className="flex items-center justify-center px-4 sm:px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="label-eyebrow mb-2">Sign In</p>
          <h1 className="text-3xl font-display font-800 mb-8">Welcome Back</h1>

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
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label-eyebrow">Password</label>
                <Link to="/forgot-password" className="text-xs text-rust hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-warnred text-sm">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Verifying…' : 'Sign In'}
            </button>

            <div className="flex items-center gap-3 py-1">
              <span className="flex-1 dashed-rule" />
              <span className="label-eyebrow">Or</span>
              <span className="flex-1 dashed-rule" />
            </div>

            <GoogleButton />
          </form>

          <p className="text-sm text-inkfaint mt-6 text-center">
            No account?{' '}
            <Link to="/signup" className="text-rust hover:underline font-medium">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
