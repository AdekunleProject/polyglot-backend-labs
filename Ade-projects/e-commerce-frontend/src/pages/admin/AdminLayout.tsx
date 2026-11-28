import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LuBadgeDollarSign, LuBoxes, LuChartColumn, LuClipboardList, LuExternalLink, LuLayoutDashboard, LuLogOut, LuMenu, LuPackage, LuRotateCcw, LuScrollText, LuTags, LuUsers, LuX } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { Logo } from '../../components/Logo';
import { DemoBanner } from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABEL } from '../../lib/format';
import type { Role } from '../../types';

interface Item { to: string; label: string; icon: IconType; roles: Role[]; end?: boolean }

const ALL: Role[] = ['manager', 'admin', 'superadmin'];
const ITEMS: Item[] = [
  { to: '/admin', label: 'Overview', icon: LuLayoutDashboard, roles: ALL, end: true },
  { to: '/admin/products', label: 'Products', icon: LuBoxes, roles: ['manager'] },
  { to: '/admin/catalog', label: 'Brands & categories', icon: LuTags, roles: ALL },
  { to: '/admin/orders', label: 'Orders', icon: LuPackage, roles: ALL },
  { to: '/admin/payments', label: 'Payments', icon: LuBadgeDollarSign, roles: ['admin', 'superadmin'] },
  { to: '/admin/refunds', label: 'Refunds', icon: LuRotateCcw, roles: ALL },
  { to: '/admin/users', label: 'People', icon: LuUsers, roles: ALL },
  { to: '/admin/reports', label: 'Reports', icon: LuChartColumn, roles: ALL },
  { to: '/admin/audit', label: 'Audit log', icon: LuScrollText, roles: ['superadmin'] },
];

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); window.scrollTo({ top: 0 }); }, [loc.pathname]);
  if (!user) return null;
  const items = ITEMS.filter((i) => i.roles.includes(user.role));
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-white/12 text-white shadow-inner ring-1 ring-white/15' : 'text-white/65 hover:bg-white/8 hover:text-white'}`;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-6"><Logo light to="/admin" /></div>
      <p className="px-5 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">{ROLE_LABEL[user.role]} console</p>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={link}><i.icon className="text-lg" />{i.label}</NavLink>)}
      </nav>
      <div className="m-3 space-y-1 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3 px-1 pb-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">{user.firstname[0]}{user.lastname[0]}</span>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{user.firstname} {user.lastname}</p><p className="truncate text-xs text-white/50">{user.email}</p></div>
        </div>
        <Link to="/" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"><LuExternalLink /> View the store</Link>
        <Link to="/account/security" className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"><LuClipboardList /> Profile & security</Link>
        <button onClick={async () => { await signOut(); nav('/login'); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white"><LuLogOut /> Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <div className="lg:flex">
        <aside className="hero-bg sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{sidebar}</aside>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/85 px-4 py-3 backdrop-blur lg:hidden">
            <Logo compact />
            <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-10 w-10 place-items-center rounded-xl border border-line text-xl"><LuMenu /></button>
          </header>
          {open && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <div className="absolute inset-0 bg-night-950/60" onClick={() => setOpen(false)} />
              <div className="hero-bg absolute inset-y-0 left-0 w-72 animate-rise">
                <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 text-2xl text-white/70"><LuX /></button>
                {sidebar}
              </div>
            </div>
          )}
          <main className="mx-auto max-w-7xl px-4 py-7 sm:px-8"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-display text-2xl font-extrabold sm:text-3xl">{title}</h1>{sub && <p className="mt-1 text-sm text-mute">{sub}</p>}</div>
      {action}
    </div>
  );
}
