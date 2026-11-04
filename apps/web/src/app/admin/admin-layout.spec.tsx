import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminLayout from './layout';
import * as AuthContextModule from '@/components/auth/auth-provider';
import * as AdminApiModule from '@/lib/api/admin';

let mockPathname = '/admin';
const mockPush = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Admin Layout & Navigation Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/admin';
  });

  it('redirects anonymous unauthenticated users to login', () => {
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

    renderWithClient(
      <AdminLayout>
        <div>Admin Subpage Content</div>
      </AdminLayout>,
    );

    expect(screen.queryByText('Admin Subpage Content')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('/login?next='));
  });

  it('renders 403 Access Denied page when user is not an administrator', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'user-regular',
        email: 'alice@market.test',
        displayName: 'Alice',
        role: 'USER',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    renderWithClient(
      <AdminLayout>
        <div>Admin Subpage Content</div>
      </AdminLayout>,
    );

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText(/You do not have permission to access the administration panel/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Admin Subpage Content')).not.toBeInTheDocument();
  });

  it('renders administration shell and sidebar navigation when user is an ADMIN', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'admin-1',
        email: 'admin@market.test',
        displayName: 'Root Admin',
        role: 'ADMIN',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt-admin',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(AdminApiModule.adminApi, 'fetchStats').mockResolvedValueOnce({
      users: { ACTIVE: 10, SUSPENDED: 1, BANNED: 0 },
      listings: { DRAFT: 2, OPEN: 5, IN_PROGRESS: 1, COMPLETED: 2, CLOSED: 1, REMOVED: 0 },
      bids: 15,
      agreements: { ACTIVE: 3, DELIVERED: 0, COMPLETED: 4, CANCELLED: 1, DISPUTED: 0 },
      openReports: 3,
      daily: [],
    });

    renderWithClient(
      <AdminLayout>
        <div>Admin Subpage Content</div>
      </AdminLayout>,
    );

    expect(screen.getByText('Administration Control Center')).toBeInTheDocument();
    expect(screen.getByText('Admin Subpage Content')).toBeInTheDocument();

    // Verify all admin nav items exist
    expect(screen.getAllByRole('link', { name: /overview/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /users/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /categories/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /listings/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /reports queue/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /audit log/i })[0]).toBeInTheDocument();
  });
});
