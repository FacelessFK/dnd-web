'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser } from '@dnd/protocol';

import {
  getCurrentAuthUser,
  loginAuth,
  logoutAuth,
  registerAuth,
} from './auth-api';

type AuthContextValue = {
  error: string | null;
  loading: boolean;
  login: (params: { email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  register: (params: {
    displayName: string;
    email: string;
    password: string;
  }) => Promise<boolean>;
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getCurrentAuthUser();

    if (result.ok) {
      setUser(result.user);
      setError(null);
    } else {
      setUser(null);
      setError(result.message);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (params: { email: string; password: string }) => {
      setLoading(true);
      const result = await loginAuth(params);

      if (result.ok) {
        setUser(result.user);
        setError(null);
        setLoading(false);
        return true;
      }

      setError(result.message);
      setLoading(false);
      return false;
    },
    [],
  );

  const register = useCallback(
    async (params: {
      displayName: string;
      email: string;
      password: string;
    }) => {
      setLoading(true);
      const result = await registerAuth(params);

      if (result.ok) {
        setUser(result.user);
        setError(null);
        setLoading(false);
        return true;
      }

      setError(result.message);
      setLoading(false);
      return false;
    },
    [],
  );

  const logout = useCallback(async () => {
    setLoading(true);
    await logoutAuth();
    setUser(null);
    setError(null);
    setLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      loading,
      login,
      logout,
      refresh,
      register,
      user,
    }),
    [error, loading, login, logout, refresh, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
