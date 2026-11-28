import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from './ui';
import type { Role } from '../types';

export function RequireAuth({ roles, children }: { roles?: Role[]; children?: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'customer' ? '/account' : '/admin'} replace />;
  }
  if (user.restriction && loc.pathname !== '/account/security') {
    return <Navigate to="/account/security" replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}
