import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Expects the backend's /auth/google/callback to redirect here as:
//   {FRONTEND_URL}/auth/callback?accessToken=...&refreshToken=...
// The controller I read returns the tokens as a JSON body rather than
// redirecting — see the README for the small backend change needed to
// make that redirect happen. This page is written to work the moment
// that redirect exists.
export default function AuthCallback() {
  const [params] = useSearchParams();
  const { loginWithTokens } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken') ?? undefined;

    if (!accessToken) {
      setError('No access token was returned from Google sign-in.');
      return;
    }

    loginWithTokens(accessToken, refreshToken)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setError('Could not complete Google sign-in.'));
  }, [params, loginWithTokens, navigate]);

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-24 text-center">
      {error ? (
        <>
          <p className="text-warnred font-mono text-sm mb-4">{error}</p>
          <a href="/login" className="btn-secondary inline-block">
            Back to Sign In
          </a>
        </>
      ) : (
        <p className="label-eyebrow">Completing Google sign-in&hellip;</p>
      )}
    </div>
  );
}
