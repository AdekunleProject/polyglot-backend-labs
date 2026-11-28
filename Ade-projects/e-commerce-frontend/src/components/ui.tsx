import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuChevronLeft, LuChevronRight, LuLoaderCircle, LuX } from 'react-icons/lu';
import { errorMessage } from '../api/client';

export const Spinner = ({ className = '' }: { className?: string }) => <LuLoaderCircle className={`animate-spin ${className}`} aria-label="Loading" />;

export function PageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-mute">
      <Spinner className="text-3xl text-brand-600" />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card-pad flex flex-col items-center py-14 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-3xl text-brand-600">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-sm text-mute">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="card-pad text-center">
      <p className="font-semibold text-rose-600">{errorMessage(error)}</p>
      {onRetry && <button onClick={onRetry} className="btn-ghost btn-sm mt-3">Try again</button>}
    </div>
  );
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const t = { error: 'border-rose-200 bg-rose-50 text-rose-700', success: 'border-emerald-200 bg-emerald-50 text-emerald-700', info: 'border-brand-200 bg-brand-50 text-brand-800' }[tone];
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm font-medium ${t}`}>{children}</div>;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-mute">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-rose-600">{error}</span>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-night-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-lift sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} animate-rise`}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-mute hover:bg-slate-100 hover:text-ink"><LuX className="text-xl" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  return (
    <nav className="mt-8 flex items-center justify-center gap-1.5" aria-label="Pagination">
      <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><LuChevronLeft /></button>
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-mute">…</span>}
          <button onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined} className={n === page ? 'btn-primary btn-sm min-w-9' : 'btn-ghost btn-sm min-w-9'}>{n}</button>
        </span>
      ))}
      <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><LuChevronRight /></button>
    </nav>
  );
}

export function StatusBadge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'gray'; children: ReactNode }) {
  return <span className={`badge-${tone}`}>{children}</span>;
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 text-sm text-mute">
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-1.5">
          {i > 0 && <LuChevronRight className="text-xs" />}
          {it.to ? <Link to={it.to} className="hover:text-brand-600">{it.label}</Link> : <span className="font-medium text-ink">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function SectionHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h2 className="h-section">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, icon, tone = 'violet', sub }: { label: string; value: ReactNode; icon: ReactNode; tone?: 'violet' | 'rose' | 'amber' | 'emerald' | 'sky'; sub?: string }) {
  const tones = { violet: 'bg-brand-50 text-brand-600', rose: 'bg-rose-50 text-rose-600', amber: 'bg-amber-50 text-amber-600', emerald: 'bg-emerald-50 text-emerald-600', sky: 'bg-sky-50 text-sky-600' };
  return (
    <div className="card-pad flex items-center gap-4">
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl ${tones[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-mute">{label}</p>
        <p className="truncate font-display text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-mute">{sub}</p>}
      </div>
    </div>
  );
}

/** Runs an async loader and tracks loading and error state. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setError(null); } }).catch((e) => { if (alive) setError(e); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}
