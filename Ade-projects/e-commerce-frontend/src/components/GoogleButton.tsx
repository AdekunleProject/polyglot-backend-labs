import { API_URL } from '../api/client';

// Full-page redirect into the backend's Passport Google flow. Google will
// return the browser to the backend's /auth/google/callback route, which
// should redirect back to this app's /auth/callback with tokens attached
// (see the "Wiring up Google OAuth" note in the README) — the frontend
// can't complete an OAuth handshake via fetch/XHR, it has to be a real
// navigation.
export default function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  return (
    <a
      href={`${API_URL}/auth/google`}
      className="w-full flex items-center justify-center gap-2 border border-ink px-5 py-2.5 font-display uppercase tracking-wide text-sm hover:bg-ink hover:text-cream transition-colors duration-150"
    >
      <GoogleMark />
      {label}
    </a>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.5 6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.5 6 29.5 4 24 4c-7.5 0-14 4.2-17.7 10.7z" />
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-1.9 14-5.7l-6.5-5.4c-2 1.5-4.6 2.5-7.5 2.5-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.9 39.7 16.4 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.5 5.4C40.9 36 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}
