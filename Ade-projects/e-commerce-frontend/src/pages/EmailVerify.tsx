import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { verifyEmail } from '../api/auth';
import { extractErrorMessage } from '../api/client';

// Route matches the literal link the backend's signup() emails:
// `${BASE_URL}/auth/verify-email/:id/:token`. On load it calls the
// backend's actual verification endpoint (GET /auth/email-verify/:id/:token
// — note the backend's own link text and its own route don't use the same
// word order; this page's job is just to bridge that, not something you
// need to fix on the backend for this to work).
export default function EmailVerify() {
  const { id, token } = useParams<{ id: string; token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!id || !token) {
      setStatus('error');
      setMessage('This verification link is missing information.');
      return;
    }
    verifyEmail(id, token)
      .then((res) => {
        setStatus('success');
        setMessage(res.message || 'Email verified successfully.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(extractErrorMessage(err, 'This link is invalid or has expired.'));
      });
  }, [id, token]);

  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-20 text-center">
      <div className="ticket p-8">
        {status === 'loading' && <p className="label-eyebrow">Verifying your email&hellip;</p>}
        {status === 'success' && (
          <>
            <p className="text-okgreen font-display text-xl font-700 mb-2">Email Verified</p>
            <p className="text-sm text-inkfaint mb-6">{message}</p>
            <Link to="/login" className="btn-primary inline-block">
              Sign In
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-warnred font-display text-xl font-700 mb-2">Verification Failed</p>
            <p className="text-sm text-inkfaint mb-6">{message}</p>
            <Link to="/login" className="btn-secondary inline-block">
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
