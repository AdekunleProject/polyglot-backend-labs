import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-black/10 mt-20 bg-steel text-white/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <p className="font-display text-xl font-800 text-white mb-2">Duka</p>
          <p className="text-sm">Order anything, delivered to your door.</p>
        </div>

        <div>
          <p className="text-white text-sm font-display font-600 mb-3">Shop</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/shop" className="hover:text-white transition-colors">
                All Products
              </Link>
            </li>
            <li>
              <Link to="/cart" className="hover:text-white transition-colors">
                Cart
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-white text-sm font-display font-600 mb-3">Account</p>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/dashboard" className="hover:text-white transition-colors">
                Dashboard
              </Link>
            </li>
            <li>
              <Link to="/orders" className="hover:text-white transition-colors">
                My Orders
              </Link>
            </li>
            <li>
              <Link to="/payments" className="hover:text-white transition-colors">
                Payments
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-white text-sm font-display font-600 mb-3">Payments</p>
          <p className="text-sm">Card (Paystack) &amp; bank transfer, both trackable from your dashboard.</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 text-xs">
          Duka &copy; {new Date().getFullYear()}
        </div>
      </div>
    </footer>
  );
}
