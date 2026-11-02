import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Header } from './header';
import { Footer } from './footer';
import * as AuthContextModule from '@/components/auth/auth-provider';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Header & Footer layout components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Header with brand, search box, and login/signup when unauthenticated', () => {
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

    render(<Header />);

    expect(screen.getByLabelText('BidMarket Home')).toBeInTheDocument();
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText('Post a request/offer')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });

  it('submits search query from header to /listings?q=', async () => {
    const user = userEvent.setup();
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

    render(<Header />);

    const searchInputs = screen.getAllByLabelText('Search listings');
    const desktopSearch = searchInputs[0];
    if (!desktopSearch) throw new Error('Search input not found');

    await user.type(desktopSearch, 'web development{enter}');

    expect(mockPush).toHaveBeenCalledWith('/listings?q=' + encodeURIComponent('web development'));
  });

  it('shows user menu and notifications when authenticated and handles logout', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'u1',
        email: 'alice@market.test',
        displayName: 'Alice Wonderland',
        role: 'ADMIN',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt-123',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: mockLogout,
      refresh: vi.fn(),
    });

    render(<Header />);

    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
    const userMenuButton = screen.getByLabelText('User menu');
    expect(userMenuButton).toBeInTheDocument();
    expect(screen.getByText('Alice Wonderland')).toBeInTheDocument();

    await user.click(userMenuButton);
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByText('Admin Panel')).toBeInTheDocument();

    const logoutItem = screen.getByText('Log out');
    await user.click(logoutItem);
    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('handles mobile logout when user is authenticated', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'u2',
        email: 'bob@market.test',
        displayName: 'Bob Builder',
        role: 'ADMIN',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt-123',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: mockLogout,
      refresh: vi.fn(),
    });

    render(<Header />);

    // Open mobile menu
    await user.click(screen.getByLabelText('Toggle navigation menu'));
    expect(screen.getByText(/My Account/i)).toBeInTheDocument();

    // Click mobile logout
    await user.click(screen.getByRole('button', { name: /Log out/i }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('toggles mobile menu drawer', async () => {
    const user = userEvent.setup();
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

    render(<Header />);

    const toggleButton = screen.getByLabelText('Toggle navigation menu');
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Browse Listings')).toBeInTheDocument();

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders Footer with brand and navigation links', () => {
    render(<Footer />);
    expect(screen.getByText(/the modern marketplace connecting/i)).toBeInTheDocument();
    expect(screen.getByText('Browse Listings')).toBeInTheDocument();
    expect(screen.getByText(/all rights reserved/i)).toBeInTheDocument();
  });
});
