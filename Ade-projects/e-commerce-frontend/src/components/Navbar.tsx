import { useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import NotificationBell from './NotificationBell';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium hover:text-rust transition-colors ${isActive ? 'text-rust' : 'text-ink'}`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(searchInput ? `/?search=${encodeURIComponent(searchInput)}` : '/');
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-black/10 shadow-sm">
      {/* Top row: logo, search, account/cart */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4 sm:gap-6">
        <Link to="/" className="flex items-center gap-1 shrink-0">
          <span className="font-display text-2xl sm:text-3xl font-800 text-ink leading-none">Duka</span>
          <span className="hidden sm:inline text-[10px] font-display font-semibold uppercase tracking-wide bg-rust text-white rounded px-1.5 py-0.5 -translate-y-2">
            mart
          </span>
        </Link>

        <form onSubmit={handleSearch} className="flex-1 flex max-w-2xl">
          <input
            className="flex-1 bg-manila/60 border border-black/10 rounded-l-lg px-3 py-2 text-sm focus:border-rust focus:bg-white transition-colors outline-none"
            placeholder="Search for anything…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit" className="bg-rust hover:bg-rustdark text-white px-4 rounded-r-lg transition-colors" aria-label="Search">
            <SearchIcon />
          </button>
        </form>

        <div className="flex items-center gap-4 sm:gap-5 shrink-0">
          {user ? (
            <Link to="/profile" className="hidden sm:flex items-center gap-2 text-sm font-medium hover:text-rust transition-colors">
              <span className="w-7 h-7 rounded-full bg-manila overflow-hidden flex items-center justify-center shrink-0">
                {user.profileImage ? (
                  <img src={user.profileImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="font-display text-xs font-semibold">{user.firstname?.[0]}</span>
                )}
              </span>
              <span className="max-w-[8rem] truncate">{user.firstname}</span>
            </Link>
          ) : (
            <Link to="/login" className="hidden sm:block text-sm font-medium hover:text-rust transition-colors">
              Sign In
            </Link>
          )}

          <Link to="/cart" className="relative flex items-center gap-1.5 text-sm font-medium hover:text-rust transition-colors">
            <CartIcon />
            <span className="hidden sm:inline">Cart</span>
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-2 sm:-right-3 bg-rust text-white text-[10px] font-semibold w-4 h-4 rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>

          {user && <NotificationBell />}
        </div>
      </div>

      {/* Second row: quick nav */}
      <div className="border-t border-black/5 bg-manila/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-10 flex items-center gap-5 overflow-x-auto">
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/shop" className={navLinkClass}>
            Shop
          </NavLink>
          {user && (
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
          )}
          {user && (
            <NavLink to="/orders" className={navLinkClass}>
              My Orders
            </NavLink>
          )}
          {user && (
            <NavLink to="/payments" className={navLinkClass}>
              Payments
            </NavLink>
          )}
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className={`${navLinkClass({ isActive: false })} ml-auto text-steel`}>
              Seller Admin
            </NavLink>
          )}
          {!user && (
            <Link to="/login" className="sm:hidden ml-auto text-sm font-medium text-rust">
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function CartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.5 3h2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
