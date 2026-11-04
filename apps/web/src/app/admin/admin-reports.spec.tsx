import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminReportsPage from './reports/page';
import * as AuthContextModule from '@/components/auth/auth-provider';
import * as AdminApiModule from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockReports: AdminApiModule.AdminReportItem[] = [
  {
    id: 'report-1',
    reporterId: 'user-reporter',
    targetType: 'LISTING',
    targetId: 'list-123',
    reason: 'SPAM',
    details: 'Spam listing advertising off-platform service',
    status: 'OPEN',
    resolution: null,
    resolutionNote: null,
    resolvedById: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    resolvedAt: null,
    reporter: {
      id: 'user-reporter',
      displayName: 'Alice Reporter',
      email: 'alice@market.test',
    },
    target: {
      id: 'list-123',
      title: 'Spammy Search Boost Service',
      status: 'OPEN',
    },
  },
  {
    id: 'report-2',
    reporterId: 'user-reporter-2',
    targetType: 'USER',
    targetId: 'user-bad',
    reason: 'HARASSMENT',
    details: 'User sent threatening messages',
    status: 'OPEN',
    resolution: null,
    resolutionNote: null,
    resolvedById: null,
    createdAt: '2026-02-02T00:00:00.000Z',
    resolvedAt: null,
    reporter: {
      id: 'user-reporter-2',
      displayName: 'Bob Reporter',
      email: 'bob@market.test',
    },
    target: {
      id: 'user-bad',
      displayName: 'Toxic Troll',
      status: 'ACTIVE',
    },
  },
  {
    id: 'report-3',
    reporterId: 'user-reporter-3',
    targetType: 'MESSAGE',
    targetId: 'msg-456',
    reason: 'FRAUD',
    details: 'Attempted wire transfer scam',
    status: 'RESOLVED',
    resolution: 'REMOVE_CONTENT',
    resolutionNote: 'Message removed and warning issued',
    resolvedById: 'admin-1',
    createdAt: '2026-02-03T00:00:00.000Z',
    resolvedAt: '2026-02-03T01:00:00.000Z',
    reporter: {
      id: 'user-reporter-3',
      displayName: 'Charlie Buyer',
      email: 'charlie@market.test',
    },
    target: {
      id: 'msg-456',
      conversationId: 'conv-1',
      body: 'Send money to my external account',
      deletedAt: '2026-02-03T01:00:00.000Z',
    },
  },
];

describe('AdminReportsPage', () => {
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
    vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockImplementation(
      () => new Promise(() => {}),
    );

    renderWithClient(<AdminReportsPage />);
    expect(screen.getByLabelText(/loading reports list/i)).toBeInTheDocument();
  });

  it('renders error state with retry button', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(AdminApiModule.adminApi, 'fetchReports')
      .mockRejectedValueOnce(new Error('Moderation service offline'));

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Failed to Load Reports')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fetchSpy.mockResolvedValueOnce({ items: [mockReports[0]!], nextCursor: null });
    await user.click(retryBtn);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();
  });

  it('renders open reports with target preview details and reporter info', async () => {
    vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[0]!, mockReports[1]!],
      nextCursor: null,
    });

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();
    expect(screen.getByText('Alice Reporter')).toBeInTheDocument();
    expect(screen.getByText(/Spam listing advertising off-platform service/i)).toBeInTheDocument();
    expect(screen.getByText('Toxic Troll')).toBeInTheDocument();

    // Verify resolve buttons are present for open reports
    expect(screen.getAllByRole('button', { name: /resolve report/i })).toHaveLength(2);
  });

  it('resolves an open report with action DISMISS', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[0]!],
      nextCursor: null,
    });
    const resolveSpy = vi.spyOn(AdminApiModule.adminApi, 'resolveReport').mockResolvedValueOnce({
      id: 'report-1',
      status: 'DISMISSED',
      resolution: 'DISMISS',
    });

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();

    const resolveBtn = screen.getByRole('button', { name: /resolve report/i });
    await user.click(resolveBtn);

    expect(screen.getByRole('heading', { name: /resolve report/i })).toBeInTheDocument();

    // Action defaults to DISMISS
    const noteInput = screen.getByLabelText(/resolution note/i);
    await user.type(noteInput, 'False positive after investigation');

    const confirmBtn = screen.getByRole('button', { name: /confirm resolution/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith('report-1', {
        action: 'DISMISS',
        note: 'False positive after investigation',
      });
    });
  });

  it('resolves report with REMOVE_CONTENT action', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[0]!],
      nextCursor: null,
    });
    const resolveSpy = vi.spyOn(AdminApiModule.adminApi, 'resolveReport').mockResolvedValueOnce({
      id: 'report-1',
      status: 'RESOLVED',
      resolution: 'REMOVE_CONTENT',
    });

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();

    const resolveBtn = screen.getByRole('button', { name: /resolve report/i });
    await user.click(resolveBtn);

    const actionSelect = screen.getByLabelText(/moderation action/i);
    await user.click(actionSelect);
    const removeOption = await screen.findByRole('option', { name: /REMOVE_CONTENT/i });
    await user.click(removeOption);

    const noteInput = screen.getByLabelText(/resolution note/i);
    await user.type(noteInput, 'Removed illegal spam advertisement');

    const confirmBtn = screen.getByRole('button', { name: /confirm resolution/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith('report-1', {
        action: 'REMOVE_CONTENT',
        note: 'Removed illegal spam advertisement',
      });
    });
  });

  it('resolves report with SUSPEND_USER action', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[1]!],
      nextCursor: null,
    });
    const resolveSpy = vi.spyOn(AdminApiModule.adminApi, 'resolveReport').mockResolvedValueOnce({
      id: 'report-2',
      status: 'RESOLVED',
      resolution: 'SUSPEND_USER',
    });

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Toxic Troll')).toBeInTheDocument();

    const resolveBtn = screen.getByRole('button', { name: /resolve report/i });
    await user.click(resolveBtn);

    const actionSelect = screen.getByLabelText(/moderation action/i);
    await user.click(actionSelect);
    const suspendOption = await screen.findByRole('option', { name: /SUSPEND_USER/i });
    await user.click(suspendOption);

    const noteInput = screen.getByLabelText(/resolution note/i);
    await user.type(noteInput, 'Violated community harassment guidelines repeatedly');

    const confirmBtn = screen.getByRole('button', { name: /confirm resolution/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(resolveSpy).toHaveBeenCalledWith('report-2', {
        action: 'SUSPEND_USER',
        note: 'Violated community harassment guidelines repeatedly',
      });
    });
  });

  it('handles 409 conflict when report is already resolved', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[0]!],
      nextCursor: null,
    });
    vi.spyOn(AdminApiModule.adminApi, 'resolveReport').mockRejectedValueOnce(
      new ApiError(409, 'Report has already been resolved', 'CONFLICT'),
    );

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();

    const resolveBtn = screen.getByRole('button', { name: /resolve report/i });
    await user.click(resolveBtn);

    const noteInput = screen.getByLabelText(/resolution note/i);
    await user.type(noteInput, 'Already handled');

    const confirmBtn = screen.getByRole('button', { name: /confirm resolution/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already been resolved/i);
    });
  });

  it('switches between OPEN, RESOLVED, and DISMISSED filter tabs', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(AdminApiModule.adminApi, 'fetchReports');

    fetchSpy.mockResolvedValueOnce({
      items: [mockReports[0]!],
      nextCursor: null,
    });

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();

    // Click Resolved tab
    fetchSpy.mockResolvedValueOnce({
      items: [mockReports[2]!],
      nextCursor: null,
    });

    const resolvedTab = screen.getByRole('tab', { name: /resolved/i });
    await user.click(resolvedTab);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'RESOLVED' }));
    });
    expect(await screen.findByText(/Attempted wire transfer scam/i)).toBeInTheDocument();
  });
});
