'use client';

import * as React from 'react';
import {
  api,
  bumpAuthGeneration,
  clearAuthSession,
  executeRefresh,
  getAccessToken,
  getAuthGeneration,
  setAccessToken,
  subscribeAccessToken,
} from '@/lib/api/client';
import { type AuthResponse, type User } from '@/lib/api/types';
import { type LoginInput, type RegisterInput } from '@/lib/validation/auth';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (credentials: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [token, setTokenState] = React.useState<string | null>(getAccessToken());
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  // Sync token state if client updates it
  React.useEffect(() => {
    return subscribeAccessToken((newToken) => {
      setTokenState(newToken);
      if (!newToken) {
        setUser(null);
      }
    });
  }, []);

  const refresh = React.useCallback(async () => {
    const gen = getAuthGeneration();
    try {
      const res = await executeRefresh();
      // Ignore stale refresh callback if auth generation changed (e.g. login/register/logout in flight)
      if (gen !== getAuthGeneration()) {
        return;
      }
      if (res && res.accessToken) {
        setUser(res.user);
      } else {
        setUser(null);
      }
    } catch {
      if (gen === getAuthGeneration()) {
        setUser(null);
      }
    }
  }, []);

  // Silent refresh on load: single-flighted and guarded against StrictMode double-mount
  const initPromiseRef = React.useRef<Promise<void> | null>(null);

  React.useEffect(() => {
    let mounted = true;

    if (!initPromiseRef.current) {
      initPromiseRef.current = refresh();
    }

    void initPromiseRef.current.finally(() => {
      if (mounted) {
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [refresh]);

  const login = React.useCallback(async (credentials: LoginInput) => {
    const res = await api.post<AuthResponse>('/auth/login', credentials, {
      skipAuth: true,
      retryOn401: false,
    });
    bumpAuthGeneration();
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const register = React.useCallback(async (data: RegisterInput) => {
    const res = await api.post<AuthResponse>('/auth/register', data, {
      skipAuth: true,
      retryOn401: false,
    });
    bumpAuthGeneration();
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = React.useCallback(async () => {
    // Bumps generation counter and clears in-memory token to discard in-flight refresh results
    clearAuthSession();
    setUser(null);
    try {
      await api.post('/auth/logout', undefined, { skipAuth: true, retryOn401: false });
    } catch {
      // Local session is already cleared
    }
  }, []);

  const value: AuthContextValue = React.useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(user && token),
      isAdmin: user?.role === 'ADMIN',
      login,
      register,
      logout,
      refresh,
    }),
    [user, token, isLoading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
