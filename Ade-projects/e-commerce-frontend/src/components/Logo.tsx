import { useId } from 'react';
import { Link } from 'react-router-dom';

export function LogoMark({ size = 40 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Harlim ShopAll">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C3AED" />
          <stop offset=".55" stopColor="#C026D3" />
          <stop offset="1" stopColor="#F43F5E" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#g${id})`} />
      <path d="M16.5 17.5v-1a7.5 7.5 0 0 1 15 0v1" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 18h18l1.6 17a2 2 0 0 1-2 2.2H15.4a2 2 0 0 1-2-2.2z" fill="#fff" fillOpacity=".16" />
      <path d="M18 22v14M30 22v14M18 29h12" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="37.5" cy="10.5" r="3" fill="#FBBF24" />
    </svg>
  );
}

export function Logo({ light = false, to = '/', compact = false }: { light?: boolean; to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5" aria-label="Harlim ShopAll home">
      <span className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105"><LogoMark size={compact ? 34 : 40} /></span>
      <span className="flex flex-col leading-none">
        <span className={`font-display text-[19px] font-extrabold tracking-tight ${light ? 'text-white' : 'text-ink'}`}>Harlim</span>
        <span className={`font-display text-[11px] font-bold uppercase tracking-[0.32em] ${light ? 'gold-text' : 'gradient-text'}`}>ShopAll</span>
      </span>
    </Link>
  );
}
