import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { StoreLayout } from './components/Layout';
import { RequireAuth } from './components/guards';
import { PageLoader } from './components/ui';
import Home from './pages/Home';
import Shop from './pages/Shop';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Login from './pages/Login';
import Signup from './pages/Signup';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Pay from './pages/Pay';
import PaymentReturn from './pages/PaymentReturn';
import DemoPaystack from './pages/DemoPaystack';
import Refunds from './pages/Refunds';
import Account from './pages/Account';
import Security from './pages/Security';

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Overview = lazy(() => import('./pages/admin/Overview'));
const AdminProducts = lazy(() => import('./pages/admin/Products'));
const Taxonomy = lazy(() => import('./pages/admin/Taxonomy'));
const AdminOrders = lazy(() => import('./pages/admin/AdminOrders'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminRefunds = lazy(() => import('./pages/admin/AdminRefunds'));
const Users = lazy(() => import('./pages/admin/Users'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Audit = lazy(() => import('./pages/admin/Audit'));

function NotFound() {
  return (
    <div className="container-x grid min-h-[55vh] place-items-center py-16 text-center">
      <div>
        <p className="gradient-text font-display text-8xl font-extrabold">404</p>
        <h1 className="mt-2 text-2xl font-bold">That page wandered off</h1>
        <p className="mt-2 text-mute">The link may be old, or the page may have moved.</p>
        <Link to="/" className="btn-primary mt-6">Back to the store</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/demo/paystack" element={<DemoPaystack />} />

        <Route element={<RequireAuth roles={['manager', 'admin', 'superadmin']} />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Overview />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="catalog" element={<Taxonomy />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="refunds" element={<AdminRefunds />} />
            <Route path="users" element={<Users />} />
            <Route path="reports" element={<Reports />} />
            <Route path="audit" element={<Audit />} />
          </Route>
        </Route>

        <Route element={<StoreLayout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="product/:id" element={<ProductDetail />} />
          <Route path="payment/return" element={<PaymentReturn />} />
          <Route element={<RequireAuth roles={['customer']} />}>
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetail />} />
            <Route path="orders/:id/pay" element={<Pay />} />
            <Route path="refunds" element={<Refunds />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="account/security" element={<Security />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
