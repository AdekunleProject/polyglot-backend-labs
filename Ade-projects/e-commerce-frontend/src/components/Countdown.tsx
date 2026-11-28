import { useEffect, useState } from 'react';
import { LuTimer } from 'react-icons/lu';

const pad = (n: number) => String(n).padStart(2, '0');

export function useRemaining(endsAt?: string | null): number {
  const end = endsAt ? new Date(endsAt).getTime() : 0;
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    setLeft(Math.max(0, end - Date.now()));
    if (!end) return;
    const id = window.setInterval(() => setLeft(Math.max(0, end - Date.now())), 1000);
    return () => window.clearInterval(id);
  }, [end]);
  return left;
}

export function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d > 0 ? `${d}d ` : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Ticking timer for a product's deal. Renders nothing once it has run out. */
export function Countdown({ endsAt, variant = 'chip', className = '' }: { endsAt?: string | null; variant?: 'chip' | 'block'; className?: string }) {
  const left = useRemaining(endsAt);
  if (!endsAt || left <= 0) return null;
  const text = formatRemaining(left);
  if (variant === 'block') {
    return (
      <div className={`inline-flex items-center gap-3 rounded-2xl border border-flame-500/30 bg-flame-500/10 px-4 py-3 ${className}`} role="timer" aria-label={`Deal ends in ${text}`}>
        <LuTimer className="text-xl text-flame-500" />
        <div><p className="text-[11px] font-bold uppercase tracking-wider text-flame-500">Deal ends in</p><p className="font-display text-xl font-extrabold tabular-nums leading-tight">{text}</p></div>
      </div>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-flame-500 px-2 py-1 text-[11px] font-bold tabular-nums text-white shadow-soft ${className}`} role="timer" aria-label={`Deal ends in ${text}`}>
      <LuTimer size={12} /> {text}
    </span>
  );
}
