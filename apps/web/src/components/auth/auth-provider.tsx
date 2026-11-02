'use client';

import * as React from 'react';
import { api, getAccessToken, setAccessToken, subscribeAccessToken } from '@/lib/api/client';
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
    try {
      const res = await api.post<AuthResponse>('/auth/refresh', undefined, { retryOn401: false });
      if (res && res.accessToken) {
        setAccessToken(res.accessToken);
        setUser(res.user);
      } else {
        setAccessToken(null);
        setUser(null);
      }
    } catch {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  // Silent refresh on load
  React.useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await refresh();
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [refresh]);

  const login = React.useCallback(async (credentials: LoginInput) => {
    const res = await api.post<AuthResponse>('/auth/login', credentials, {
      skipAuth: true,
      retryOn401: false,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const register = React.useCallback(async (data: RegisterInput) => {
    const res = await api.post<AuthResponse>('/auth/register', data, {
      skipAuth: true,
      retryOn401: false,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout', undefined, { retryOn401: false });
    } catch {
      // Ignore errors on logout
    } finally {
      setAccessToken(null);
      setUser(null);
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
