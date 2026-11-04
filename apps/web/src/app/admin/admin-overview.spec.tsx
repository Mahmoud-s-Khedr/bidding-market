import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminOverviewPage from './page';
import * as AuthContextModule from '@/components/auth/auth-provider';
import * as AdminApiModule from '@/lib/api/admin';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockStats: AdminApiModule.AdminStats = {
  users: { ACTIVE: 120, SUSPENDED: 5, BANNED: 2 },
  listings: { DRAFT: 10, OPEN: 80, IN_PROGRESS: 15, COMPLETED: 40, CLOSED: 20, REMOVED: 3 },
  bids: 240,
  agreements: { ACTIVE: 25, DELIVERED: 5, COMPLETED: 35, CANCELLED: 8, DISPUTED: 2 },
  openReports: 4,
  daily: [
    { day: '2026-10-01', signups: 5, listings: 3, bids: 10, agreements: 2 },
    { day: '2026-10-02', signups: 8, listings: 4, bids: 12, agreements: 1 },
    { day: '2026-10-03', signups: 2, listings: 1, bids: 6, agreements: 0 },
  ],
};

describe('AdminOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'admin-1',
        email: 'admin@market.test',
        displayName: 'Root Admin',
        role: 'ADMIN',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('renders loading state initially', () => {
    vi.spyOn(AdminApiModule.adminApi, 'fetchStats').mockImplementation(() => new Promise(() => {}));

    renderWithClient(<AdminOverviewPage />);
    expect(screen.getByLabelText(/loading admin dashboard statistics/i)).toBeInTheDocument();
  });

  it('renders error state with retry button', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(AdminApiModule.adminApi, 'fetchStats')
      .mockRejectedValueOnce(new Error('Network failure'));

    renderWithClient(<AdminOverviewPage />);

    expect(await screen.findByText('Failed to Load Dashboard Statistics')).toBeInTheDocument();
    expect(screen.getByText('Network failure')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fetchSpy.mockResolvedValueOnce(mockStats);
    await user.click(retryBtn);

    expect(await screen.findByText('Total Users')).toBeInTheDocument();
  });

  it('renders stat tiles and breakdown numbers accurately', async () => {
    vi.spyOn(AdminApiModule.adminApi, 'fetchStats').mockResolvedValue(mockStats);

    renderWithClient(<AdminOverviewPage />);

    // Total Users
    expect(await screen.findByText('127')).toBeInTheDocument(); // 120 + 5 + 2
    expect(screen.getByText(/120 active/i)).toBeInTheDocument();
    expect(screen.getByText(/5 suspended/i)).toBeInTheDocument();
    expect(screen.getByText(/2 banned/i)).toBeInTheDocument();

    // Listings
    expect(screen.getByText('168')).toBeInTheDocument(); // 10+80+15+40+20+3
    expect(screen.getByText(/80 open/i)).toBeInTheDocument();
    expect(screen.getByText(/3 removed/i)).toBeInTheDocument();

    // Bids & Agreements
    expect(screen.getByText('240 Bids')).toBeInTheDocument();
    expect(screen.getByText(/75 agreements/i)).toBeInTheDocument(); // 25+5+35+8+2

    // Reports queue alert
    expect(screen.getAllByText('4')[0]).toBeInTheDocument();
    expect(screen.getByText('Action Required')).toBeInTheDocument();
  });

  it('renders 30-day SVG chart with text alternative fallback', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchStats').mockResolvedValue(mockStats);

    renderWithClient(<AdminOverviewPage />);

    // SVG Chart is rendered with role="img"
    const chart = await screen.findByRole('img', { name: /30-day trend chart/i });
    expect(chart).toBeInTheDocument();

    // Toggle to accessible data table
    const tableToggleBtn = screen.getByRole('button', { name: /switch to accessible data table/i });
    await user.click(tableToggleBtn);

    // Accessible table is rendered
    expect(screen.getByLabelText(/30-day marketplace metrics data table/i)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /2026-10-01/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /2026-10-02/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /2026-10-03/i })).toBeInTheDocument();

    // Toggle back to chart
    const chartToggleBtn = screen.getByRole('button', {
      name: /switch to interactive chart view/i,
    });
    await user.click(chartToggleBtn);
    expect(screen.getByRole('img', { name: /30-day trend chart/i })).toBeInTheDocument();
  });

  it('renders empty state when zero activity data exists in 30-day window', async () => {
    const zeroStats: AdminApiModule.AdminStats = {
      ...mockStats,
      daily: [
        { day: '2026-10-01', signups: 0, listings: 0, bids: 0, agreements: 0 },
        { day: '2026-10-02', signups: 0, listings: 0, bids: 0, agreements: 0 },
      ],
    };
    vi.spyOn(AdminApiModule.adminApi, 'fetchStats').mockResolvedValue(zeroStats);

    renderWithClient(<AdminOverviewPage />);

    expect(await screen.findByText('No Activity Data in the Last 30 Days')).toBeInTheDocument();
  });
});
