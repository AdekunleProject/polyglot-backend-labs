import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { User } from '../types';
import { tokenStore } from '../api/client';
import * as authApi from '../api/auth';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: authApi.SignupPayload) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  loginWithTokens: (accessToken: string, refreshToken?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.getAccess()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await authApi.fetchMe();
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const loggedInUser = await authApi.login({ email, password });
    setUser(loggedInUser);
  };

  const signup = async (payload: authApi.SignupPayload) => {
    return authApi.signup(payload);
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  // Used by the Google OAuth callback page once tokens arrive via query params.
  const loginWithTokens = async (accessToken: string, refreshTokenValue?: string) => {
    tokenStore.set(accessToken, refreshTokenValue);
    await refreshUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser, loginWithTokens }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
