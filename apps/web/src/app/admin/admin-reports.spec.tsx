import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminReportsPage, { getDisabledResolutionReason } from './reports/page';
import * as AuthContextModule from '@/components/auth/auth-provider';
import * as AdminApiModule from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import { toast } from '@/components/ui/toast';

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
  {
    id: 'report-4',
    reporterId: 'user-reporter-4',
    targetType: 'AGREEMENT',
    targetId: 'agree-1',
    reason: 'OTHER',
    details: 'Disputed agreement terms',
    status: 'OPEN',
    resolution: null,
    resolutionNote: null,
    resolvedById: null,
    createdAt: '2026-02-04T00:00:00.000Z',
    resolvedAt: null,
    reporter: {
      id: 'user-reporter-4',
      displayName: 'Dave Buyer',
      email: 'dave@market.test',
    },
    target: {
      id: 'agree-1',
      status: 'PENDING',
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

  it('handles 409 conflict when report is already resolved: closes dialog, refetches, and notifies', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[0]!],
      nextCursor: null,
    });
    vi.spyOn(AdminApiModule.adminApi, 'resolveReport').mockRejectedValueOnce(
      new ApiError(409, 'Report has already been resolved', 'CONFLICT'),
    );
    const toastErrorSpy = vi.spyOn(toast, 'error');

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();

    const resolveBtn = screen.getByRole('button', { name: /resolve report/i });
    await user.click(resolveBtn);

    const noteInput = screen.getByLabelText(/resolution note/i);
    await user.type(noteInput, 'Already handled');

    const confirmBtn = screen.getByRole('button', { name: /confirm resolution/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      // Dialog closed
      expect(screen.queryByRole('heading', { name: /resolve report/i })).not.toBeInTheDocument();
      // Toast error with API message
      expect(toastErrorSpy).toHaveBeenCalledWith('Conflict', 'Report has already been resolved');
      // Refetched
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('handles non-"already resolved" 409 conflict (e.g. Listing already removed): closes dialog, shows API message, and refetches', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[0]!],
      nextCursor: null,
    });
    vi.spyOn(AdminApiModule.adminApi, 'resolveReport').mockRejectedValueOnce(
      new ApiError(409, 'Listing is already removed', 'CONFLICT'),
    );
    const toastErrorSpy = vi.spyOn(toast, 'error');

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();

    const resolveBtn = screen.getByRole('button', { name: /resolve report/i });
    await user.click(resolveBtn);

    const noteInput = screen.getByLabelText(/resolution note/i);
    await user.type(noteInput, 'Takedown duplicate item');

    const confirmBtn = screen.getByRole('button', { name: /confirm resolution/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      // Dialog is closed
      expect(screen.queryByRole('heading', { name: /resolve report/i })).not.toBeInTheDocument();
      // Toast displayed API error message
      expect(toastErrorSpy).toHaveBeenCalledWith('Conflict', 'Listing is already removed');
      // Refetched
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('handles 404 not found: closes dialog, shows API message in toast, and refetches', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[0]!],
      nextCursor: null,
    });
    vi.spyOn(AdminApiModule.adminApi, 'resolveReport').mockRejectedValueOnce(
      new ApiError(404, 'Report not found', 'NOT_FOUND'),
    );
    const toastErrorSpy = vi.spyOn(toast, 'error');

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();

    const resolveBtn = screen.getByRole('button', { name: /resolve report/i });
    await user.click(resolveBtn);

    const noteInput = screen.getByLabelText(/resolution note/i);
    await user.type(noteInput, 'Attempting resolution');

    const confirmBtn = screen.getByRole('button', { name: /confirm resolution/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      // Dialog is closed
      expect(screen.queryByRole('heading', { name: /resolve report/i })).not.toBeInTheDocument();
      // Toast displays not found message
      expect(toastErrorSpy).toHaveBeenCalledWith('Not found', 'Report not found');
      // Refetched
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('disables invalid resolution actions in dialog based on targetType', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchReports').mockResolvedValue({
      items: [mockReports[1]!, mockReports[3]!], // USER and AGREEMENT
      nextCursor: null,
    });

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Toxic Troll')).toBeInTheDocument();

    // 1. For USER target: REMOVE_CONTENT should be disabled
    const resolveUserBtn = screen.getAllByRole('button', { name: /resolve report/i })[0]!;
    await user.click(resolveUserBtn);

    expect(screen.getByRole('heading', { name: /resolve report/i })).toBeInTheDocument();
    expect(
      screen.getByText(/note: content removal is not applicable to user accounts/i),
    ).toBeInTheDocument();

    const actionSelect = screen.getByLabelText(/moderation action/i);
    await user.click(actionSelect);

    const removeContentOption = await screen.findByRole('option', { name: /REMOVE_CONTENT/i });
    expect(removeContentOption).toHaveAttribute('data-disabled');
    expect(removeContentOption).toHaveAttribute('aria-disabled', 'true');

    const suspendUserOption = await screen.findByRole('option', { name: /SUSPEND_USER/i });
    expect(suspendUserOption).not.toHaveAttribute('aria-disabled', 'true');

    // Close select dropdown then close user dialog
    await user.keyboard('{Escape}');
    const cancelBtn = await screen.findByRole('button', { name: /cancel/i });
    await user.click(cancelBtn);

    // 2. For AGREEMENT target: both REMOVE_CONTENT and SUSPEND_USER should be disabled
    const resolveAgreeBtn = screen.getAllByRole('button', { name: /resolve report/i })[1]!;
    await user.click(resolveAgreeBtn);

    expect(
      screen.getByText(
        /note: content removal is not applicable to agreements\. note: user suspension is not applicable to agreements/i,
      ),
    ).toBeInTheDocument();

    const actionSelect2 = screen.getByLabelText(/moderation action/i);
    await user.click(actionSelect2);

    const removeOption2 = await screen.findByRole('option', { name: /REMOVE_CONTENT/i });
    expect(removeOption2).toHaveAttribute('aria-disabled', 'true');

    const suspendOption2 = await screen.findByRole('option', { name: /SUSPEND_USER/i });
    expect(suspendOption2).toHaveAttribute('aria-disabled', 'true');
  });

  it('verifies helper getDisabledResolutionReason unit logic', () => {
    expect(getDisabledResolutionReason('USER', 'REMOVE_CONTENT')).toContain(
      'not applicable to user accounts',
    );
    expect(getDisabledResolutionReason('USER', 'SUSPEND_USER')).toBeNull();
    expect(getDisabledResolutionReason('USER', 'DISMISS')).toBeNull();

    expect(getDisabledResolutionReason('AGREEMENT', 'REMOVE_CONTENT')).toContain(
      'not applicable to agreements',
    );
    expect(getDisabledResolutionReason('AGREEMENT', 'SUSPEND_USER')).toContain(
      'not applicable to agreements',
    );
    expect(getDisabledResolutionReason('AGREEMENT', 'DISMISS')).toBeNull();

    expect(getDisabledResolutionReason('LISTING', 'REMOVE_CONTENT')).toBeNull();
    expect(getDisabledResolutionReason('LISTING', 'SUSPEND_USER')).toBeNull();
    expect(getDisabledResolutionReason('MESSAGE', 'REMOVE_CONTENT')).toBeNull();
    expect(getDisabledResolutionReason('BID', 'REMOVE_CONTENT')).toBeNull();
  });

  it('switches between OPEN, RESOLVED, and DISMISSED filter buttons with aria-pressed', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(AdminApiModule.adminApi, 'fetchReports');

    fetchSpy.mockResolvedValueOnce({
      items: [mockReports[0]!],
      nextCursor: null,
    });

    renderWithClient(<AdminReportsPage />);

    expect(await screen.findByText('Spammy Search Boost Service')).toBeInTheDocument();

    const openBtn = screen.getByRole('button', { name: /open queue/i });
    const resolvedBtn = screen.getByRole('button', { name: /resolved/i });
    const dismissedBtn = screen.getByRole('button', { name: /dismissed/i });

    expect(openBtn).toHaveAttribute('aria-pressed', 'true');
    expect(resolvedBtn).toHaveAttribute('aria-pressed', 'false');
    expect(dismissedBtn).toHaveAttribute('aria-pressed', 'false');

    // Click Resolved button
    fetchSpy.mockResolvedValueOnce({
      items: [mockReports[2]!],
      nextCursor: null,
    });

    await user.click(resolvedBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'RESOLVED' }));
      expect(resolvedBtn).toHaveAttribute('aria-pressed', 'true');
      expect(openBtn).toHaveAttribute('aria-pressed', 'false');
    });
    expect(await screen.findByText(/Attempted wire transfer scam/i)).toBeInTheDocument();
  });
});
