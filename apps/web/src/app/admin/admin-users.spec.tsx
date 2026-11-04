import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminUsersPage from './users/page';
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

const mockUsers: AdminApiModule.AdminUserItem[] = [
  {
    id: 'admin-1',
    email: 'admin@market.test',
    displayName: 'Root Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    suspendedReason: null,
    suspendedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'user-bob',
    email: 'bob@market.test',
    displayName: 'Bob Builder',
    role: 'USER',
    status: 'ACTIVE',
    suspendedReason: null,
    suspendedAt: null,
    createdAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'user-charlie',
    email: 'charlie@market.test',
    displayName: 'Charlie Spam',
    role: 'USER',
    status: 'SUSPENDED',
    suspendedReason: 'Abusive chat messages',
    suspendedAt: '2026-02-10T00:00:00.000Z',
    createdAt: '2026-02-05T00:00:00.000Z',
  },
];

describe('AdminUsersPage', () => {
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

  it('renders loading state while fetching users', () => {
    vi.spyOn(AdminApiModule.adminApi, 'fetchUsers').mockImplementation(() => new Promise(() => {}));

    renderWithClient(<AdminUsersPage />);
    expect(screen.getByLabelText(/loading users list/i)).toBeInTheDocument();
  });

  it('renders error state with retry option', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(AdminApiModule.adminApi, 'fetchUsers')
      .mockRejectedValueOnce(new Error('Database timeout'));

    renderWithClient(<AdminUsersPage />);

    expect(await screen.findByText('Failed to Load Users')).toBeInTheDocument();
    expect(screen.getByText('Database timeout')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fetchSpy.mockResolvedValueOnce({ items: mockUsers, nextCursor: null });
    await user.click(retryBtn);

    expect(await screen.findByText('Bob Builder')).toBeInTheDocument();
  });

  it('renders user list and respects self-protection rule for currently logged-in admin', async () => {
    vi.spyOn(AdminApiModule.adminApi, 'fetchUsers').mockResolvedValue({
      items: mockUsers,
      nextCursor: null,
    });

    renderWithClient(<AdminUsersPage />);

    expect(await screen.findByText('Root Admin')).toBeInTheDocument();
    expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    expect(screen.getByText('Charlie Spam')).toBeInTheDocument();

    // Verify self-protection: Modify button for logged-in admin is disabled
    const selfRow = screen.getByTestId('user-row-admin-1');
    expect(selfRow).toHaveTextContent(/you/i);
    expect(selfRow).toHaveTextContent(/cannot modify self/i);
    const selfModifyBtn = selfRow.querySelector('button');
    expect(selfModifyBtn).toBeDisabled();

    // Bob Builder is another user, modify button is enabled
    const bobRow = screen.getByTestId('user-row-user-bob');
    const bobModifyBtn = bobRow.querySelector('button');
    expect(bobModifyBtn).not.toBeDisabled();
  });

  it('modifies user role and status via modal and handles successful update', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchUsers').mockResolvedValue({
      items: mockUsers,
      nextCursor: null,
    });
    const targetUser = mockUsers[1];
    if (!targetUser) throw new Error('Missing mock user');
    const updatedUser: AdminApiModule.AdminUserItem = {
      ...targetUser,
      status: 'SUSPENDED',
      suspendedReason: 'Violated marketplace rules',
    };
    const updateSpy = vi
      .spyOn(AdminApiModule.adminApi, 'updateUser')
      .mockResolvedValueOnce(updatedUser);

    renderWithClient(<AdminUsersPage />);

    expect(await screen.findByText('Bob Builder')).toBeInTheDocument();

    // Click modify on Bob
    const bobRow = screen.getByTestId('user-row-user-bob');
    const bobModifyBtn = bobRow.querySelector('button')!;
    await user.click(bobModifyBtn);

    // Dialog opens
    expect(screen.getByRole('heading', { name: /modify user account/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Bob Builder/i)[0]).toBeInTheDocument();

    // Change status to SUSPENDED
    const statusSelect = screen.getByLabelText(/account status/i);
    await user.click(statusSelect);
    const suspendedOption = await screen.findByRole('option', { name: /suspended/i });
    await user.click(suspendedOption);

    // Enter reason
    const reasonInput = screen.getByLabelText(/reason for change/i);
    await user.type(reasonInput, 'Violated marketplace rules');

    // Confirm changes
    const confirmBtn = screen.getByRole('button', { name: /confirm changes/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      // Role was unchanged (USER), so ONLY status and reason are sent
      expect(updateSpy).toHaveBeenCalledWith('user-bob', {
        status: 'SUSPENDED',
        reason: 'Violated marketplace rules',
      });
    });
  }, 15000);

  it('handles 409 conflict when attempting to demote the last admin', async () => {
    const user = userEvent.setup();
    const otherAdmin: AdminApiModule.AdminUserItem = {
      id: 'admin-2',
      email: 'secondary-admin@market.test',
      displayName: 'Secondary Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      suspendedReason: null,
      suspendedAt: null,
      createdAt: '2026-02-01T00:00:00.000Z',
    };

    vi.spyOn(AdminApiModule.adminApi, 'fetchUsers').mockResolvedValue({
      items: [otherAdmin],
      nextCursor: null,
    });
    vi.spyOn(AdminApiModule.adminApi, 'updateUser').mockRejectedValueOnce(
      new ApiError(409, 'Cannot demote the last admin', 'CONFLICT'),
    );

    renderWithClient(<AdminUsersPage />);

    expect(await screen.findByText('Secondary Admin')).toBeInTheDocument();

    const row = screen.getByTestId('user-row-admin-2');
    const modifyBtn = row.querySelector('button')!;
    await user.click(modifyBtn);

    expect(
      await screen.findByRole('heading', { name: /modify user account/i }),
    ).toBeInTheDocument();

    // Select USER to demote admin
    const roleSelect = screen.getByLabelText(/role assignment/i);
    await user.click(roleSelect);
    const userOption = await screen.findByRole('option', { name: /standard user/i });
    await user.click(userOption);

    const confirmBtn = screen.getByRole('button', { name: /confirm changes/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /cannot demote the last remaining administrator/i,
      );
    });
  });

  it('sends only role when only role is changed (e.g. promoting user to admin)', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchUsers').mockResolvedValue({
      items: [mockUsers[1]!], // Bob Builder (USER, ACTIVE)
      nextCursor: null,
    });
    const updateSpy = vi.spyOn(AdminApiModule.adminApi, 'updateUser').mockResolvedValueOnce({
      ...mockUsers[1]!,
      role: 'ADMIN',
    });

    renderWithClient(<AdminUsersPage />);

    expect(await screen.findByText('Bob Builder')).toBeInTheDocument();

    const bobRow = screen.getByTestId('user-row-user-bob');
    const bobModifyBtn = bobRow.querySelector('button')!;
    await user.click(bobModifyBtn);

    expect(
      await screen.findByRole('heading', { name: /modify user account/i }),
    ).toBeInTheDocument();

    const roleSelect = screen.getByLabelText(/role assignment/i);
    await user.click(roleSelect);
    const adminOption = await screen.findByRole('option', { name: /^administrator$/i });
    await user.click(adminOption);

    const confirmBtn = screen.getByRole('button', { name: /confirm changes/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('user-bob', {
        role: 'ADMIN',
      });
    });
  });

  it('does not send API request when no fields are modified', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchUsers').mockResolvedValue({
      items: [mockUsers[1]!], // Bob Builder
      nextCursor: null,
    });
    const updateSpy = vi.spyOn(AdminApiModule.adminApi, 'updateUser');

    renderWithClient(<AdminUsersPage />);

    expect(await screen.findByText('Bob Builder')).toBeInTheDocument();

    const bobRow = screen.getByTestId('user-row-user-bob');
    const bobModifyBtn = bobRow.querySelector('button')!;
    await user.click(bobModifyBtn);

    const confirmBtn = screen.getByRole('button', { name: /confirm changes/i });
    await user.click(confirmBtn);

    // Dialog closes without firing API update
    expect(updateSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: /modify user account/i })).not.toBeInTheDocument();
  });

  it('paginates through user lists with cursor navigation', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(AdminApiModule.adminApi, 'fetchUsers');

    fetchSpy.mockResolvedValueOnce({
      items: [mockUsers[0]!, mockUsers[1]!],
      nextCursor: 'cursor-page-2',
    });

    renderWithClient(<AdminUsersPage />);

    expect(await screen.findByText('Root Admin')).toBeInTheDocument();

    const nextBtn = screen.getByRole('button', { name: /next/i });
    const prevBtn = screen.getByRole('button', { name: /previous/i });
    expect(prevBtn).toBeDisabled();
    expect(nextBtn).not.toBeDisabled();

    // Click Next
    fetchSpy.mockResolvedValueOnce({
      items: [mockUsers[2]!],
      nextCursor: null,
    });

    await user.click(nextBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'cursor-page-2' }));
    });
  });
});
