import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './auth-provider';
import { api, getAccessToken } from '@/lib/api/client';
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
  const { user, token, isAuthenticated, isAdmin, isLoading, login, register, logout } = useAuth();

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
    </div>
  );
}

describe('AuthProvider & useAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws error when useAuth is used outside AuthProvider', () => {
    // Suppress console error for this test
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within an AuthProvider');
    consoleError.mockRestore();
  });

  it('performs silent refresh on mount and initializes user if refresh succeeds', async () => {
    vi.spyOn(api, 'post').mockImplementation((path) => {
      if (path === '/auth/refresh') {
        return Promise.resolve({
          accessToken: 'fresh-token',
          user: mockUser,
        });
      }
      return Promise.reject(new Error('not found'));
    });

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
    vi.spyOn(api, 'post').mockImplementation((path) => {
      if (path === '/auth/refresh') {
        return Promise.reject(new Error('401 Unauthorized'));
      }
      return Promise.reject(new Error('not found'));
    });

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

  it('handles login flow properly', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'post').mockImplementation((path, body) => {
      if (path === '/auth/refresh') {
        return Promise.reject(new Error('No session'));
      }
      if (path === '/auth/login') {
        return Promise.resolve({
          accessToken: 'login-token-xyz',
          user: { ...mockUser, email: (body as { email: string }).email },
        });
      }
      return Promise.reject(new Error('not found'));
    });

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
    vi.spyOn(api, 'post').mockImplementation((path, body) => {
      if (path === '/auth/refresh') {
        return Promise.reject(new Error('No session'));
      }
      if (path === '/auth/register') {
        return Promise.resolve({
          accessToken: 'registered-token-xyz',
          user: {
            ...mockUser,
            email: (body as { email: string }).email,
            displayName: (body as { displayName: string }).displayName,
          },
        });
      }
      return Promise.reject(new Error('not found'));
    });

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
    vi.spyOn(api, 'post').mockImplementation((path) => {
      if (path === '/auth/refresh') {
        return Promise.resolve({
          accessToken: 'initial-token',
          user: mockUser,
        });
      }
      if (path === '/auth/logout') {
        return Promise.resolve();
      }
      return Promise.reject(new Error('not found'));
    });

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

  it('detects admin role correctly', async () => {
    vi.spyOn(api, 'post').mockImplementation((path) => {
      if (path === '/auth/refresh') {
        return Promise.resolve({
          accessToken: 'admin-token',
          user: { ...mockUser, role: 'ADMIN' as const },
        });
      }
      return Promise.reject(new Error('not found'));
    });

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
});
