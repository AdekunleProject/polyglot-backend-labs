import { NavLink, Outlet } from 'react-router-dom';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors border-l-4 ${
    isActive
      ? 'border-rust bg-white/5 text-white'
      : 'border-transparent text-white/60 hover:text-white hover:bg-white/5'
  }`;

const navItems: [string, string, () => JSX.Element, boolean?][] = [
  ['/admin', 'Dashboard', OverviewIcon, true],
  ['/admin/orders', 'Order Management', OrdersIcon],
  ['/admin/users', 'Customers', UsersIcon],
  ['/admin/categories', 'Categories', CategoryIcon],
  ['/admin/payments', 'Transactions', CardIcon],
  ['/admin/products', 'Product List', BoxIcon, true],
  ['/admin/products/new', 'Add Product', PlusIcon],
  ['/admin/brands', 'Brands', TagIcon],
];

export default function AdminLayout() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] -mx-4 sm:-mx-6 -my-0">
      <aside className="w-56 shrink-0 bg-steel py-6 hidden md:flex md:flex-col">
        <div className="px-5 mb-6">
          <p className="text-white/40 text-[11px] font-display font-semibold uppercase tracking-wide">
            Seller Admin
          </p>
        </div>
        <nav className="space-y-1 flex-1">
          {navItems.map(([to, label, Icon, end]) => (
            <NavLink key={to} to={to} end={end} className={linkClass}>
              <Icon /> {label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/profile" className={linkClass}>
          <ProfileIcon /> My Profile
        </NavLink>
      </aside>

      <div className="flex-1 min-w-0 bg-cream px-4 sm:px-8 py-8">
        {/* Mobile nav fallback */}
        <nav className="md:hidden flex gap-2 overflow-x-auto mb-6 pb-2">
          {navItems.map(([to, label, , end]) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-full border ${
                  isActive ? 'border-rust text-rust' : 'border-black/10'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `whitespace-nowrap text-sm font-medium px-3 py-1.5 rounded-full border ${
                isActive ? 'border-rust text-rust' : 'border-black/10'
              }`
            }
          >
            My Profile
          </NavLink>
        </nav>
        <Outlet />
      </div>
    </div>
  );
}

function iconProps() {
  return { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 };
}
function OverviewIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M21 8l-9-5-9 5 9 5 9-5z" />
      <path d="M3 8v8l9 5 9-5V8" />
      <path d="M12 13v8" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M20.6 12.6 12 21.2 2.8 12l8.6-8.6H20a1 1 0 0 1 1 1v8.2z" />
      <circle cx="16" cy="8" r="1.2" />
    </svg>
  );
}
function OrdersIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M9 2h6l1 4H8l1-4z" />
      <path d="M4 6h16l-1.5 14a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1L4 6z" />
    </svg>
  );
}
function CardIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}
function UsersIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="18" cy="9" r="2.5" />
      <path d="M15.5 20a4.5 4.5 0 0 1 6.7-3.9" />
    </svg>
  );
}
function CategoryIcon() {
  return (
    <svg {...iconProps()}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function ProfileIcon() {
  return (
    <svg {...iconProps()}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg {...iconProps()}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
