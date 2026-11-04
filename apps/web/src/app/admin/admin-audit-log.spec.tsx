import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminAuditLogPage from './audit-log/page';
import * as AuthContextModule from '@/components/auth/auth-provider';
import * as AdminApiModule from '@/lib/api/admin';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockAuditRows: AdminApiModule.AuditLogItem[] = [
  {
    id: 'audit-1',
    actorId: 'admin-1',
    action: 'USER_UPDATED',
    targetType: 'USER',
    targetId: 'user-bob',
    data: { role: 'USER', status: 'SUSPENDED', reason: 'Spam violation' },
    createdAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'audit-2',
    actorId: 'admin-1',
    action: 'LISTING_REMOVED',
    targetType: 'LISTING',
    targetId: 'list-99',
    data: { reason: 'Prohibited goods' },
    createdAt: '2026-02-02T00:00:00.000Z',
  },
];

describe('AdminAuditLogPage', () => {
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
    vi.spyOn(AdminApiModule.adminApi, 'fetchAuditLog').mockImplementation(
      () => new Promise(() => {}),
    );

    renderWithClient(<AdminAuditLogPage />);
    expect(screen.getByLabelText(/loading audit log/i)).toBeInTheDocument();
  });

  it('renders error state with retry button', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(AdminApiModule.adminApi, 'fetchAuditLog')
      .mockRejectedValueOnce(new Error('Audit log service timeout'));

    renderWithClient(<AdminAuditLogPage />);

    expect(await screen.findByText('Failed to Load Audit Log')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fetchSpy.mockResolvedValueOnce({ items: mockAuditRows, nextCursor: null });
    await user.click(retryBtn);

    expect(await screen.findByText('USER_UPDATED')).toBeInTheDocument();
  });

  it('renders audit entries and toggles JSON payload details', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchAuditLog').mockResolvedValue({
      items: mockAuditRows,
      nextCursor: null,
    });

    renderWithClient(<AdminAuditLogPage />);

    expect(await screen.findByText('USER_UPDATED')).toBeInTheDocument();
    expect(screen.getByText('LISTING_REMOVED')).toBeInTheDocument();

    // Find view toggle button for first row
    const viewBtn = screen.getByRole('button', {
      name: /toggle payload details for USER_UPDATED/i,
    });
    expect(viewBtn).toBeInTheDocument();

    // Click to expand payload
    await user.click(viewBtn);

    // JSON payload is displayed
    expect(await screen.findByText(/Spam violation/i)).toBeInTheDocument();

    // Click to hide payload
    await user.click(viewBtn);
    expect(screen.queryByText(/Spam violation/i)).not.toBeInTheDocument();
  });

  it('paginates through audit records using cursor controls', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(AdminApiModule.adminApi, 'fetchAuditLog');

    fetchSpy.mockResolvedValueOnce({
      items: [mockAuditRows[0]!],
      nextCursor: 'cursor-2',
    });

    renderWithClient(<AdminAuditLogPage />);

    expect(await screen.findByText('USER_UPDATED')).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /next/i });
    const prevBtn = screen.getByRole('button', { name: /previous/i });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    fetchSpy.mockResolvedValueOnce({
      items: [mockAuditRows[1]!],
      nextCursor: null,
    });

    await user.click(nextBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'cursor-2' }));
    });
  });
});
