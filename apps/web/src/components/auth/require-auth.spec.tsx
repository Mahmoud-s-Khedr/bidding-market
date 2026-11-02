import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RequireAuth } from './require-auth';
import { RequireAdmin } from './require-admin';
import * as AuthContextModule from './auth-provider';

const mockReplace = vi.fn();
const mockPush = vi.fn();
let mockPathname = '/dashboard';
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

describe('RequireAuth & RequireAdmin wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/dashboard';
    mockSearchParams = new URLSearchParams();
  });

  it('renders loading indicator while authentication is resolving', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isLoading: true,
      isAuthenticated: false,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    render(
      <RequireAuth>
        <div>Secret Content</div>
      </RequireAuth>,
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('redirects to /login?next=... when user is not authenticated', () => {
    mockPathname = '/orders/123';
    mockSearchParams = new URLSearchParams('tab=history');

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    render(
      <RequireAuth>
        <div>Secret Content</div>
      </RequireAuth>,
    );

    expect(mockReplace).toHaveBeenCalledWith(
      '/login?next=' + encodeURIComponent('/orders/123?tab=history'),
    );
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('renders protected children when user is authenticated', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: '1',
        email: 'alice@market.test',
        displayName: 'Alice',
        role: 'USER',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    render(
      <RequireAuth>
        <div>Secret Content</div>
      </RequireAuth>,
    );

    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });

  it('RequireAdmin denies access when user is not an admin', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: '2',
        email: 'bob@market.test',
        displayName: 'Bob',
        role: 'USER',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    render(
      <RequireAdmin>
        <div>Admin Panel Secret</div>
      </RequireAdmin>,
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.queryByText('Admin Panel Secret')).not.toBeInTheDocument();
  });

  it('RequireAdmin renders admin content when user has admin role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: '3',
        email: 'admin@market.test',
        displayName: 'Admin',
        role: 'ADMIN',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    render(
      <RequireAdmin>
        <div>Admin Panel Secret</div>
      </RequireAdmin>,
    );

    expect(screen.getByText('Admin Panel Secret')).toBeInTheDocument();
  });
});
