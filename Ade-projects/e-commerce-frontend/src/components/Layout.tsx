import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LuBell, LuChevronDown, LuLayoutDashboard, LuLogOut, LuMail, LuMapPin, LuMenu, LuPackage, LuPhone, LuRotateCcw, LuSearch, LuShieldCheck, LuShoppingBag, LuTruck, LuUser, LuX } from 'react-icons/lu';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import * as shop from '../api/shop';
import { DEMO, resetDemo } from '../demo/server';
import { isStaff, ROLE_LABEL, timeAgo } from '../lib/format';
import type { AppNotification } from '../types';

function useOutside(onOut: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onOut]);
  return ref;
}

export function DemoBanner() {
  if (!DEMO) return null;
  return (
    <div className="bg-night-950 px-4 py-2 text-center text-xs font-medium text-white/80">
      <span className="mr-2 rounded-full bg-gold-400 px-2 py-0.5 font-bold text-night-900">DEMO</span>
      Everything runs in your browser with sample data. Verification and 2FA codes are always <b className="text-gold-300">123456</b>.
      <button onClick={() => { resetDemo(); window.location.hash = '#/'; window.location.reload(); }} className="ml-3 underline decoration-white/40 underline-offset-2 hover:text-white">Reset demo data</button>
    </div>
  );
}

function Bell() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const ref = useOutside(() => setOpen(false));
  const loc = useLocation();

  useEffect(() => {
    if (!user) return;
    let alive = true;
    const poll = () => shop.unreadCount().then((r) => alive && setCount(r.count)).catch(() => undefined);
    poll();
    const t = setInterval(poll, 45000);
    return () => { alive = false; clearInterval(t); };
  }, [user, loc.pathname]);

  const toggle = async () => {
    setOpen((o) => !o);
    if (!open) { try { setItems((await shop.listNotifications()).slice(0, 8)); } catch { /* ignore */ } }
  };
  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.isRead) { await shop.markRead(n._id).catch(() => undefined); setCount((c) => Math.max(0, c - 1)); }
    if (n.link) nav(n.link);
  };
  const readAll = async () => { await shop.markAllRead().catch(() => undefined); setCount(0); setItems((l) => l.map((n) => ({ ...n, isRead: true }))); };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} aria-label="Notifications" className="relative grid h-10 w-10 place-items-center rounded-xl text-xl text-ink transition hover:bg-brand-50">
        <LuBell />
        {count > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-flame-500 px-1 text-[10px] font-bold text-white">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 animate-rise overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-display font-bold">Notifications</p>
            {count > 0 && <button onClick={readAll} className="text-xs font-semibold text-brand-600 hover:underline">Mark all read</button>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-8 text-center text-sm text-mute">You are all caught up.</p>}
            {items.map((n) => (
              <button key={n._id} onClick={() => openItem(n)} className={`flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition last:border-0 hover:bg-brand-50 ${n.isRead ? '' : 'bg-brand-50/50'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-brand-500'}`} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{n.title}</span>
                  <span className="line-clamp-2 text-xs text-mute">{n.message}</span>
                  <span className="mt-0.5 block text-[11px] text-mute/80">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useOutside(() => setOpen(false));
  if (!user) return null;
  const go = (to: string) => { setOpen(false); nav(to); };
  const out = async () => { setOpen(false); await signOut(); toast.info('You are signed out.'); nav('/'); };
  const item = 'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium hover:bg-brand-50';
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl py-1.5 pl-1.5 pr-2.5 transition hover:bg-brand-50" aria-haspopup="menu" aria-expanded={open}>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-gradient font-display text-sm font-bold text-white">{user.firstname[0]}{user.lastname[0]}</span>
        <span className="hidden text-left leading-tight lg:block"><span className="block text-sm font-semibold">{user.firstname}</span><span className="block text-[11px] text-mute">{ROLE_LABEL[user.role]}</span></span>
        <LuChevronDown className="hidden text-mute lg:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-50 w-60 animate-rise overflow-hidden rounded-2xl border border-line bg-white py-1.5 shadow-lift">
          <div className="border-b border-line px-4 pb-3 pt-2"><p className="truncate font-semibold">{user.firstname} {user.lastname}</p><p className="truncate text-xs text-mute">{user.email}</p></div>
          {isStaff(user.role) && <button className={item} onClick={() => go('/admin')}><LuLayoutDashboard /> Staff console</button>}
          {user.role === 'customer' && <>
            <button className={item} onClick={() => go('/account')}><LuLayoutDashboard /> My dashboard</button>
            <button className={item} onClick={() => go('/orders')}><LuPackage /> My orders</button>
            <button className={item} onClick={() => go('/refunds')}><LuRotateCcw /> Returns & refunds</button>
          </>}
          <button className={item} onClick={() => go('/account/security')}><LuShieldCheck /> Profile & security</button>
          <button className={`${item} text-rose-600`} onClick={out}><LuLogOut /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { user } = useAuth();
  const { count } = useCart();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [loc.pathname]);

  const submit = (e: FormEvent) => { e.preventDefault(); nav(q.trim() ? `/shop?search=${encodeURIComponent(q.trim())}` : '/shop'); setMenu(false); };
  const link = ({ isActive }: { isActive: boolean }) => `rounded-lg px-3 py-2 text-sm font-semibold transition ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink/75 hover:bg-brand-50 hover:text-brand-700'}`;

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/80 backdrop-blur-xl">
      <div className="container-x flex h-[72px] items-center gap-3 lg:gap-6">
        <button className="grid h-10 w-10 place-items-center rounded-xl text-2xl hover:bg-brand-50 lg:hidden" onClick={() => setMenu((m) => !m)} aria-label="Menu">{menu ? <LuX /> : <LuMenu />}</button>
        <Logo />
        <nav className="ml-2 hidden items-center gap-1 lg:flex" aria-label="Main">
          <NavLink to="/" end className={link}>Home</NavLink>
          <NavLink to="/shop" className={link}>Shop</NavLink>
          {user?.role === 'customer' && <NavLink to="/orders" className={link}>Orders</NavLink>}
          {user && isStaff(user.role) && <NavLink to="/admin" className={link}>Console</NavLink>}
        </nav>
        <form onSubmit={submit} className="relative mx-auto hidden max-w-md flex-1 md:block" role="search">
          <LuSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search phones, fashion, home…" aria-label="Search products" className="field rounded-full! border-transparent! bg-brand-50/70! py-2.5! pl-11!" />
        </form>
        <div className="ml-auto flex items-center gap-1.5">
          {user?.role !== 'admin' && user?.role !== 'superadmin' && user?.role !== 'manager' && (
            <Link to="/cart" className="relative grid h-10 w-10 place-items-center rounded-xl text-xl hover:bg-brand-50" aria-label={`Cart, ${count} items`}>
              <LuShoppingBag />
              {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-gradient px-1 text-[11px] font-bold text-white">{count}</span>}
            </Link>
          )}
          {user && <Bell />}
          {user ? <UserMenu /> : (
            <div className="flex items-center gap-2">
              <Link to="/login" className="btn-ghost btn-sm hidden sm:inline-flex">Sign in</Link>
              <Link to="/signup" className="btn-primary btn-sm">Join free</Link>
            </div>
          )}
        </div>
      </div>
      {menu && (
        <div className="animate-rise border-t border-line bg-white px-4 pb-5 pt-3 lg:hidden">
          <form onSubmit={submit} className="relative mb-3" role="search">
            <LuSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-mute" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="field pl-11!" aria-label="Search products" />
          </form>
          <div className="grid gap-1">
            <NavLink to="/" end className={link}>Home</NavLink>
            <NavLink to="/shop" className={link}>Shop</NavLink>
            {user?.role === 'customer' && <><NavLink to="/orders" className={link}>My orders</NavLink><NavLink to="/refunds" className={link}>Returns & refunds</NavLink></>}
            {user && isStaff(user.role) && <NavLink to="/admin" className={link}>Staff console</NavLink>}
            {!user && <NavLink to="/login" className={link}>Sign in</NavLink>}
          </div>
        </div>
      )}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 bg-night-950 text-white/70">
      <div className="container-x grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-1">
          <Logo light />
          <p className="mt-4 max-w-xs text-sm leading-relaxed">One store for everything you need. Honest prices, fast delivery across Nigeria and buyer protection on every order.</p>
        </div>
        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-white">Shop</h4>
          <ul className="space-y-2 text-sm">
            <li><Link to="/shop" className="hover:text-white">All products</Link></li>
            <li><Link to="/shop?featured=true" className="hover:text-white">Featured</Link></li>
            <li><Link to="/cart" className="hover:text-white">Your cart</Link></li>
            <li><Link to="/orders" className="hover:text-white">Track an order</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-white">Buyer protection</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><LuRotateCcw className="mt-0.5 shrink-0 text-gold-400" /> Report a fault within 24h for a refund</li>
            <li className="flex gap-2"><LuTruck className="mt-0.5 shrink-0 text-gold-400" /> Replacement window of 72 hours</li>
            <li className="flex gap-2"><LuShieldCheck className="mt-0.5 shrink-0 text-gold-400" /> Secure payments with Paystack</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-3 font-display text-sm font-bold text-white">Contact</h4>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><LuMapPin className="mt-0.5 shrink-0 text-gold-400" /> Lekki Phase 1, Lagos, Nigeria</li>
            <li className="flex gap-2"><LuMail className="mt-0.5 shrink-0 text-gold-400" /> support@harlimshopall.com</li>
            <li className="flex gap-2"><LuPhone className="mt-0.5 shrink-0 text-gold-400" /> +234 801 234 5678</li>
            <li className="flex gap-2"><LuUser className="mt-0.5 shrink-0 text-gold-400" /> Mon to Sat, 8am to 7pm</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/45">© {new Date().getFullYear()} Harlim ShopAll. All rights reserved.</div>
    </footer>
  );
}

export function StoreLayout() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo({ top: 0 }); }, [loc.pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <Navbar />
      <main className="flex-1"><Outlet /></main>
      <Footer />
    </div>
  );
}
