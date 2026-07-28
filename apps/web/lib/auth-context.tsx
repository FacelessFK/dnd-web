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
  /** Server error code for the current `error`, when it had one. */
  errorCode: string | null;
  /** `Retry-After` seconds for the current `error`, when the server sent one. */
  errorRetryAfterSeconds: number | null;
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
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorRetryAfterSeconds, setErrorRetryAfterSeconds] = useState<
    number | null
  >(null);

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
    setErrorRetryAfterSeconds(null);
  }, []);

  const applyError = useCallback(
    (result: {
      code?: string;
      message: string;
      retryAfterSeconds?: number;
    }) => {
      setError(result.message);
      setErrorCode(result.code ?? null);
      setErrorRetryAfterSeconds(result.retryAfterSeconds ?? null);
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getCurrentAuthUser();

    if (result.ok) {
      setUser(result.user);
      clearError();
    } else {
      setUser(null);
      applyError(result);
    }

    setLoading(false);
  }, [applyError, clearError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (params: { email: string; password: string }) => {
      setLoading(true);
      const result = await loginAuth(params);

      if (result.ok) {
        setUser(result.user);
        clearError();
        setLoading(false);
        return true;
      }

      applyError(result);
      setLoading(false);
      return false;
    },
    [applyError, clearError],
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
        clearError();
        setLoading(false);
        return true;
      }

      applyError(result);
      setLoading(false);
      return false;
    },
    [applyError, clearError],
  );

  const logout = useCallback(async () => {
    setLoading(true);
    await logoutAuth();
    setUser(null);
    clearError();
    setLoading(false);
  }, [clearError]);

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      errorCode,
      errorRetryAfterSeconds,
      loading,
      login,
      logout,
      refresh,
      register,
      user,
    }),
    [
      error,
      errorCode,
      errorRetryAfterSeconds,
      loading,
      login,
      logout,
      refresh,
      register,
      user,
    ],
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
