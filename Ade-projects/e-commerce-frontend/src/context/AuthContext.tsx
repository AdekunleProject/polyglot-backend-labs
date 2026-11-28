import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import { tokenStore } from '../api/client';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<authApi.TwoFactorChallenge | User>;
  signInTwoFactor: (email: string, challengeToken: string, code: string) => Promise<User>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.getAccess()) { setUser(null); return; }
    try { setUser(await authApi.fetchMe()); } catch { setUser(null); }
  }, []);

  useEffect(() => { refreshUser().finally(() => setLoading(false)); }, [refreshUser]);
  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('hsa:signed-out', out);
    return () => window.removeEventListener('hsa:signed-out', out);
  }, []);

  const value = useMemo<AuthState>(() => ({
    user, loading, refreshUser,
    signIn: async (email, password) => {
      const r = await authApi.login(email, password);
      if (authApi.isChallenge(r)) return r;
      setUser(r.user);
      return r.user;
    },
    signInTwoFactor: async (email, challengeToken, code) => {
      const r = await authApi.loginWithTwoFactor(email, challengeToken, code);
      setUser(r.user);
      return r.user;
    },
    signOut: async () => { try { await authApi.logout(); } finally { setUser(null); } },
  }), [user, loading, refreshUser]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}
