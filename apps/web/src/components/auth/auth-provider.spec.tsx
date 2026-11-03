import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './auth-provider';
import { clearAuthSession, getAccessToken } from '@/lib/api/client';
import { type User } from '@/lib/api/types';

const mockUser: User = {
  id: 'user-1',
  email: 'test@market.test',
  displayName: 'Test User',
  role: 'USER',
  isBusiness: false,
  createdAt: new Date().toISOString(),
};

function TestConsumer() {
  const { user, token, isAuthenticated, isAdmin, isLoading, login, register, logout, refresh } =
    useAuth();

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'ready'}</div>
      <div data-testid="auth-state">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</div>
      <div data-testid="admin-state">{isAdmin ? 'admin' : 'regular'}</div>
      <div data-testid="user-email">{user?.email || 'no-user'}</div>
      <div data-testid="token">{token || 'no-token'}</div>

      <button
        onClick={() => {
          void login({ email: 'login@market.test', password: 'Password123!' });
        }}
      >
        Trigger Login
      </button>

      <button
        onClick={() => {
          void register({
            email: 'reg@market.test',
            password: 'Password123!',
            displayName: 'Reg User',
            isBusiness: false,
          });
        }}
      >
        Trigger Register
      </button>

      <button
        onClick={() => {
          void logout();
        }}
      >
        Trigger Logout
      </button>

      <button
        onClick={() => {
          void refresh();
        }}
      >
        Trigger Refresh
      </button>
    </div>
  );
}

describe('AuthProvider & useAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAuthSession();
  });

  it('throws error when useAuth is used outside AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });

  it('performs silent refresh on mount and initializes user if refresh succeeds', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'fresh-token',
              user: mockUser,
            }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('loading');

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('test@market.test');
    expect(screen.getByTestId('token')).toHaveTextContent('fresh-token');
    expect(getAccessToken()).toBe('fresh-token');
  });

  it('sets unauthenticated state if silent refresh fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('no-user');
    expect(screen.getByTestId('token')).toHaveTextContent('no-token');
  });

  it('handles React StrictMode double-mount without sending duplicate refresh requests', async () => {
    let refreshCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCount++;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 200,
                headers: new Headers({ 'content-type': 'application/json' }),
                json: () =>
                  Promise.resolve({
                    accessToken: 'strict-mode-token',
                    user: mockUser,
                  }),
              }),
            15,
          ),
        );
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <React.StrictMode>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('token')).toHaveTextContent('strict-mode-token');
    // Crucial: exactly 1 network request fired despite StrictMode double-mounting
    expect(refreshCount).toBe(1);
  });

  it('handles login flow properly', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
        });
      }
      if (url.includes('/auth/login')) {
        const body = JSON.parse(init?.body as string) as { email: string };
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'login-token-xyz',
              user: { ...mockUser, email: body.email },
            }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    await user.click(screen.getByText('Trigger Login'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    });

    expect(screen.getByTestId('user-email')).toHaveTextContent('login@market.test');
    expect(screen.getByTestId('token')).toHaveTextContent('login-token-xyz');
  });

  it('handles register flow properly', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
        });
      }
      if (url.includes('/auth/register')) {
        const body = JSON.parse(init?.body as string) as { email: string; displayName: string };
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'registered-token-xyz',
              user: {
                ...mockUser,
                email: body.email,
                displayName: body.displayName,
              },
            }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    await user.click(screen.getByText('Trigger Register'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    });

    expect(screen.getByTestId('user-email')).toHaveTextContent('reg@market.test');
    expect(screen.getByTestId('token')).toHaveTextContent('registered-token-xyz');
  });

  it('handles logout flow and clears token and user', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'initial-token',
              user: mockUser,
            }),
        });
      }
      if (url.includes('/auth/logout')) {
        return Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    });

    await user.click(screen.getByText('Trigger Logout'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');
    });

    expect(screen.getByTestId('user-email')).toHaveTextContent('no-user');
    expect(screen.getByTestId('token')).toHaveTextContent('no-token');
    expect(getAccessToken()).toBeNull();
  });

  it('handles logout-during-refresh race condition by discarding stale refresh results', async () => {
    const user = userEvent.setup();
    let resolveInitialRefresh: (val: unknown) => void;
    const initialRefreshPromise = new Promise((resolve) => {
      resolveInitialRefresh = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return initialRefreshPromise;
      }
      if (url.includes('/auth/logout')) {
        return Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // Initial refresh is pending. User triggers logout before refresh resolves.
    await user.click(screen.getByText('Trigger Logout'));

    // Now initial refresh completes afterwards
    resolveInitialRefresh!({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () =>
        Promise.resolve({
          accessToken: 'stale-race-token',
          user: mockUser,
        }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    // Client must remain unauthenticated; the stale refresh result must be discarded
    expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');
    expect(screen.getByTestId('token')).toHaveTextContent('no-token');
    expect(getAccessToken()).toBeNull();
  });

  it('keeps user logged in when pending silent refresh resolves with 401 after login completes', async () => {
    const user = userEvent.setup();
    let resolveInitialRefresh: (val: unknown) => void;
    const initialRefreshPromise = new Promise((resolve) => {
      resolveInitialRefresh = resolve;
    });

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/auth/refresh')) {
        return initialRefreshPromise;
      }
      if (url.includes('/auth/login')) {
        const body = JSON.parse(init?.body as string) as { email: string };
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'fresh-login-token-123',
              user: { ...mockUser, email: body.email },
            }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // Initial silent refresh is in-flight.
    // User logs in before refresh finishes:
    await user.click(screen.getByText('Trigger Login'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    });
    expect(screen.getByTestId('user-email')).toHaveTextContent('login@market.test');
    expect(screen.getByTestId('token')).toHaveTextContent('fresh-login-token-123');

    // Initial refresh now resolves with 401 late:
    resolveInitialRefresh!({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
    });

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    // Freshly logged-in user and token MUST NOT be cleared by the late 401
    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('user-email')).toHaveTextContent('login@market.test');
    expect(screen.getByTestId('token')).toHaveTextContent('fresh-login-token-123');
    expect(getAccessToken()).toBe('fresh-login-token-123');
  });

  it('detects admin role correctly', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'admin-token',
              user: { ...mockUser, role: 'ADMIN' as const },
            }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('admin-state')).toHaveTextContent('admin');
  });

  it('clears queryClient cache on logout to prevent cross-session leakage (Finding 1)', async () => {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'initial-token',
              user: mockUser,
            }),
        });
      }
      if (url.includes('/auth/logout')) {
        return Promise.resolve({
          ok: true,
          status: 204,
          headers: new Headers(),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    });

    // Initial restore must not clear cache
    expect(clearSpy).not.toHaveBeenCalled();

    const userEventSetup = userEvent.setup();
    await userEventSetup.click(screen.getByText('Trigger Logout'));

    expect(clearSpy).toHaveBeenCalled();
  });

  it('skips queryClient.clear() on initial null -> user restore', async () => {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'initial-restore-token',
              user: mockUser,
            }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    });

    expect(screen.getByTestId('user-email')).toHaveTextContent('test@market.test');
    expect(clearSpy).not.toHaveBeenCalled();
  });

  it('clears queryClient cache on login', async () => {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');

    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: false,
          status: 401,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () => Promise.resolve({ error: { code: 'UNAUTHORIZED' } }),
        });
      }
      if (url.includes('/auth/login')) {
        const body = JSON.parse(init?.body as string) as { email: string };
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'logged-in-token',
              user: { ...mockUser, email: body.email },
            }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('ready');
    });
    expect(screen.getByTestId('auth-state')).toHaveTextContent('unauthenticated');
    expect(clearSpy).not.toHaveBeenCalled();

    const user = userEvent.setup();
    await user.click(screen.getByText('Trigger Login'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    });

    expect(clearSpy).toHaveBeenCalled();
  });

  it('clears queryClient cache on user-id change A -> B', async () => {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, 'clear');

    let currentUser = { ...mockUser, id: 'user-A', email: 'userA@market.test' };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: () =>
            Promise.resolve({
              accessToken: 'token-' + currentUser.id,
              user: currentUser,
            }),
        });
      }
      return Promise.reject(new Error('not found'));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Initial restore of user-A skips clear
    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('userA@market.test');
    });
    expect(clearSpy).not.toHaveBeenCalled();

    // User switches to user-B
    currentUser = { ...mockUser, id: 'user-B', email: 'userB@market.test' };

    const user = userEvent.setup();
    await user.click(screen.getByText('Trigger Refresh'));

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('userB@market.test');
    });

    // queryClient.clear is called on user change A -> B
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });
});
