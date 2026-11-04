import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportDialog } from './report-dialog';
import { ReportButton } from './report-button';
import * as AuthContextModule from '@/components/auth/auth-provider';
import * as AdminApiModule from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/listings/list-1',
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ReportDialog & ReportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ReportButton Visibility Rules', () => {
    it('does not render ReportButton when viewer is the owner of the listing', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-1',
          email: 'alice@market.test',
          displayName: 'Alice',
          role: 'USER',
          isBusiness: false,
          createdAt: '',
        },
        token: 'token',
        isLoading: false,
        isAuthenticated: true,
        isAdmin: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refresh: vi.fn(),
      });

      renderWithClient(
        <ReportButton
          targetType="LISTING"
          targetId="listing-1"
          ownerId="user-1"
          label="Report Listing"
        />,
      );

      expect(screen.queryByRole('button', { name: /report listing/i })).not.toBeInTheDocument();
    });

    it('does not render ReportButton when viewer views their own user profile', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-1',
          email: 'alice@market.test',
          displayName: 'Alice',
          role: 'USER',
          isBusiness: false,
          createdAt: '',
        },
        token: 'token',
        isLoading: false,
        isAuthenticated: true,
        isAdmin: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refresh: vi.fn(),
      });

      renderWithClient(
        <ReportButton targetType="USER" targetId="user-1" ownerId="user-1" label="Report User" />,
      );

      expect(screen.queryByRole('button', { name: /report user/i })).not.toBeInTheDocument();
    });

    it('renders ReportButton when viewer is viewing another user content', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-1',
          email: 'alice@market.test',
          displayName: 'Alice',
          role: 'USER',
          isBusiness: false,
          createdAt: '',
        },
        token: 'token',
        isLoading: false,
        isAuthenticated: true,
        isAdmin: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refresh: vi.fn(),
      });

      renderWithClient(
        <ReportButton
          targetType="LISTING"
          targetId="listing-99"
          ownerId="user-2"
          label="Report Listing"
        />,
      );

      expect(screen.getByRole('button', { name: /report listing/i })).toBeInTheDocument();
    });
  });

  describe('ReportDialog Form & Submissions', () => {
    it('prompts user to sign in when unauthenticated', async () => {
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

      renderWithClient(
        <ReportDialog
          open={true}
          onOpenChange={vi.fn()}
          targetType="LISTING"
          targetId="listing-1"
          targetTitle="Suspicious Web Project"
        />,
      );

      expect(screen.getByText(/you must be logged in to submit a report/i)).toBeInTheDocument();

      const signInBtn = screen.getByRole('button', { name: /sign in to report/i });
      await user.click(signInBtn);
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('/login?next='));
    });

    it('submits a valid report with reason and details', async () => {
      const user = userEvent.setup();
      const mockSubmit = vi.spyOn(AdminApiModule.adminApi, 'submitReport').mockResolvedValueOnce({
        id: 'rep-1',
        reporterId: 'user-1',
        targetType: 'LISTING',
        targetId: 'listing-1',
        reason: 'SPAM',
        details: 'Unsolicited advertising message',
        status: 'OPEN',
        resolution: null,
        resolutionNote: null,
        resolvedById: null,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
      });

      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-1',
          email: 'alice@market.test',
          displayName: 'Alice',
          role: 'USER',
          isBusiness: false,
          createdAt: '',
        },
        token: 'token',
        isLoading: false,
        isAuthenticated: true,
        isAdmin: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refresh: vi.fn(),
      });

      const onOpenChange = vi.fn();
      const onSuccess = vi.fn();

      renderWithClient(
        <ReportDialog
          open={true}
          onOpenChange={onOpenChange}
          targetType="LISTING"
          targetId="listing-1"
          targetTitle="Spam Product"
          onSuccess={onSuccess}
        />,
      );

      const textarea = screen.getByLabelText(/additional details/i);
      await user.type(textarea, 'Unsolicited advertising message');

      const submitBtn = screen.getByRole('button', { name: /submit report/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockSubmit).toHaveBeenCalledWith({
          targetType: 'LISTING',
          targetId: 'listing-1',
          reason: 'SPAM',
          details: 'Unsolicited advertising message',
        });
        expect(onOpenChange).toHaveBeenCalledWith(false);
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('handles 409 conflict when duplicate open report already exists', async () => {
      const user = userEvent.setup();
      vi.spyOn(AdminApiModule.adminApi, 'submitReport').mockRejectedValueOnce(
        new ApiError(409, 'An open report already exists for this target', 'CONFLICT'),
      );

      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-1',
          email: 'alice@market.test',
          displayName: 'Alice',
          role: 'USER',
          isBusiness: false,
          createdAt: '',
        },
        token: 'token',
        isLoading: false,
        isAuthenticated: true,
        isAdmin: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refresh: vi.fn(),
      });

      renderWithClient(
        <ReportDialog
          open={true}
          onOpenChange={vi.fn()}
          targetType="LISTING"
          targetId="listing-1"
        />,
      );

      const submitBtn = screen.getByRole('button', { name: /submit report/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/already exists for this item/i);
      });
    });

    it('handles 400 bad request error gracefully', async () => {
      const user = userEvent.setup();
      vi.spyOn(AdminApiModule.adminApi, 'submitReport').mockRejectedValueOnce(
        new ApiError(400, 'You cannot report your own listing', 'VALIDATION_ERROR'),
      );

      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-1',
          email: 'alice@market.test',
          displayName: 'Alice',
          role: 'USER',
          isBusiness: false,
          createdAt: '',
        },
        token: 'token',
        isLoading: false,
        isAuthenticated: true,
        isAdmin: false,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        refresh: vi.fn(),
      });

      renderWithClient(
        <ReportDialog
          open={true}
          onOpenChange={vi.fn()}
          targetType="LISTING"
          targetId="listing-1"
        />,
      );

      const submitBtn = screen.getByRole('button', { name: /submit report/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/you cannot report your own listing/i);
      });
    });
  });
});
