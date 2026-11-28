import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuBadgeCheck, LuRotateCcw, LuTruck } from 'react-icons/lu';
import { Logo } from './Logo';
import { DemoBanner } from './Layout';

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        <aside className="hero-bg relative isolate hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="grid-lines absolute inset-0 -z-10" />
          <div className="absolute -right-16 top-1/3 -z-10 h-72 w-72 animate-drift rounded-full bg-flame-500/30 blur-3xl" />
          <Logo light />
          <div>
            <h2 className="font-display text-4xl font-extrabold leading-tight xl:text-5xl">Shop smarter.<br /><span className="gold-text">Pay safer.</span></h2>
            <p className="mt-5 max-w-md text-white/70">Join thousands of shoppers on Harlim ShopAll. One account for every order, payment and refund.</p>
            <ul className="mt-9 space-y-4 text-sm">
              {[[<LuTruck />, 'Tracked delivery to every state'], [<LuBadgeCheck />, 'Verified brands and honest prices'], [<LuRotateCcw />, 'Refund or replacement if it arrives faulty']].map(([i, t], k) => (
                <li key={k} className="flex items-center gap-3"><span className="glass grid h-10 w-10 place-items-center text-lg text-gold-300">{i}</span>{t as string}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/40">© {new Date().getFullYear()} Harlim ShopAll</p>
        </aside>
        <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 lg:hidden"><Logo /></div>
            <h1 className="font-display text-3xl font-extrabold">{title}</h1>
            {subtitle && <p className="mt-2 text-mute">{subtitle}</p>}
            <div className="mt-7">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-mute">{footer}</div>}
            <p className="mt-10 text-center text-xs text-mute"><Link to="/" className="hover:text-brand-600">← Back to the store</Link></p>
          </div>
        </main>
      </div>
    </div>
  );
}

export function PasswordInput({ value, onChange, autoComplete, placeholder, id }: { value: string; onChange: (v: string) => void; autoComplete?: string; placeholder?: string; id?: string }) {
  return <input id={id} type="password" className="field" value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} placeholder={placeholder} />;
}

export function PasswordRules({ value }: { value: string }) {
  const rules: [string, boolean][] = [['8 to 20 characters', value.length >= 8 && value.length <= 20], ['An uppercase letter', /[A-Z]/.test(value)], ['A lowercase letter', /[a-z]/.test(value)], ['A number', /[0-9]/.test(value)], ['A symbol (!@#$%^&*)', /[!@#$%^&*]/.test(value)]];
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
      {rules.map(([t, ok]) => <li key={t} className={ok ? 'font-medium text-emerald-600' : 'text-mute'}>{ok ? '✓' : '○'} {t}</li>)}
    </ul>
  );
}

export const passwordOk = (v: string) => v.length >= 8 && v.length <= 20 && /(?=.*[!@#$%^&*])(?=.*[0-9])(?=.*[A-Z])(?=.*[a-z])/.test(v);
