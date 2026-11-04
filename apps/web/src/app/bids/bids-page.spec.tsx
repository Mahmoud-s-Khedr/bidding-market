import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyBidsPage from './page';
import { api } from '@/lib/api/client';
import * as bidsApi from '@/lib/api/bids';
import * as authContext from '@/components/auth/auth-provider';
import { ToastProvider } from '@/components/ui/toast';
import { makeBidWithListing, makeListingSummary } from '../../../test/fixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => '/bids',
  useSearchParams: () => new URLSearchParams(),
}));

function renderWithToast(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('MyBidsPage (/bids)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-me',
        email: 'me@user.test',
        displayName: 'My User',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-me',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });
  });

  const bidActivePending = makeBidWithListing({
    id: 'bid-pending-1',
    listingId: 'listing-pending',
    status: 'PENDING',
    amountCents: 25000,
    deliveryDays: 5,
    listing: makeListingSummary({
      id: 'listing-pending',
      title: 'Active Website Development',
      categoryName: 'Web Development',
      kind: 'REQUEST',
    }),
  });

  const bidActiveCountered = makeBidWithListing({
    id: 'bid-countered-1',
    status: 'COUNTERED',
    amountCents: 22000,
    deliveryDays: 4,
    listing: makeListingSummary({
      id: 'listing-countered',
      title: 'Countered Mobile App',
      categoryName: 'Mobile',
      kind: 'REQUEST',
    }),
  });

  const bidAccepted = makeBidWithListing({
    id: 'bid-accepted-1',
    status: 'ACCEPTED',
    amountCents: 50000,
    deliveryDays: 10,
    listing: makeListingSummary({
      id: 'listing-accepted',
      title: 'Accepted Brand Identity',
      categoryName: 'Design',
      kind: 'OFFER',
    }),
  });

  const bidClosedRejected = makeBidWithListing({
    id: 'bid-rejected-1',
    status: 'REJECTED',
    amountCents: 10000,
    deliveryDays: 2,
    listing: makeListingSummary({
      id: 'listing-rejected',
      title: 'Rejected SEO Project',
      categoryName: 'Marketing',
      kind: 'REQUEST',
    }),
  });

  it('renders tabs with correct badge counts and filters proposals by tab', async () => {
    const user = userEvent.setup();

    const bidsByStatus: Record<string, (typeof bidActivePending)[]> = {
      PENDING: [bidActivePending],
      COUNTERED: [bidActiveCountered],
      SHORTLISTED: [],
      ACCEPTED: [bidAccepted],
      REJECTED: [bidClosedRejected],
      WITHDRAWN: [],
      DECLINED: [],
    };

    vi.spyOn(bidsApi, 'useMyBids').mockImplementation((status?: string) => {
      const items = status ? (bidsByStatus[status] ?? []) : [];
      return {
        data: {
          pages: [
            {
              items,
              nextCursor: null,
            },
          ],
          pageParams: [null],
        },
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
      } as unknown as ReturnType<typeof bidsApi.useMyBids>;
    });

    renderWithToast(<MyBidsPage />);

    // Check tab counts: Active (2), Accepted (1), Closed (1)
    expect(screen.getByTestId('tab-active')).toHaveTextContent('Active (2)');
    expect(screen.getByTestId('tab-accepted')).toHaveTextContent('Accepted (1)');
    expect(screen.getByTestId('tab-closed')).toHaveTextContent('Closed (1)');

    // Active tab is default: should display pending and countered proposals
    expect(screen.getByText('Active Website Development')).toBeInTheDocument();
    expect(screen.getByText('Countered Mobile App')).toBeInTheDocument();
    expect(screen.getByText('$250')).toBeInTheDocument();
    expect(screen.getByText('$220')).toBeInTheDocument();

    // Switch to Accepted tab
    await user.click(screen.getByTestId('tab-accepted'));
    expect(screen.getByText('Accepted Brand Identity')).toBeInTheDocument();
    expect(screen.getByText('$500')).toBeInTheDocument();

    // Switch to Closed tab
    await user.click(screen.getByTestId('tab-closed'));
    expect(screen.getByText('Rejected SEO Project')).toBeInTheDocument();
    expect(screen.getByText('$100')).toBeInTheDocument();
  });

  it('renders links to bid detail and listing on each row', () => {
    vi.spyOn(bidsApi, 'useMyBids').mockImplementation((status?: string) => {
      const items = status === 'PENDING' ? [bidActivePending] : [];
      return {
        data: {
          pages: [{ items, nextCursor: null }],
          pageParams: [null],
        },
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
      } as unknown as ReturnType<typeof bidsApi.useMyBids>;
    });

    renderWithToast(<MyBidsPage />);

    const viewProposalLink = screen.getByRole('link', { name: /view proposal/i });
    expect(viewProposalLink).toHaveAttribute('href', '/bids/bid-pending-1');

    const listingTitleLink = screen.getByRole('link', { name: 'Active Website Development' });
    expect(listingTitleLink).toHaveAttribute('href', '/listings/listing-pending');
  });

  it('renders empty states when no bids exist for a tab', async () => {
    const user = userEvent.setup();

    vi.spyOn(bidsApi, 'useMyBids').mockImplementation(() => {
      return {
        data: {
          pages: [{ items: [], nextCursor: null }],
          pageParams: [null],
        },
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
      } as unknown as ReturnType<typeof bidsApi.useMyBids>;
    });

    renderWithToast(<MyBidsPage />);

    expect(screen.getByText('No active bids')).toBeInTheDocument();

    await user.click(screen.getByTestId('tab-accepted'));
    expect(screen.getByText('No accepted bids yet')).toBeInTheDocument();

    await user.click(screen.getByTestId('tab-closed'));
    expect(screen.getByText('No closed bids')).toBeInTheDocument();
  });

  it('triggers fetchNextPage when clicking load more bids', async () => {
    const user = userEvent.setup();
    const fetchNextPage = vi.fn();

    vi.spyOn(bidsApi, 'useMyBids').mockImplementation((status?: string) => {
      const hasNext = status === 'PENDING';
      const items = status === 'PENDING' ? [bidActivePending] : [];
      return {
        data: {
          pages: [{ items, nextCursor: hasNext ? 'cur-next' : null }],
          pageParams: [null],
        },
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: hasNext,
        fetchNextPage,
      } as unknown as ReturnType<typeof bidsApi.useMyBids>;
    });

    renderWithToast(<MyBidsPage />);

    const loadMoreBtn = screen.getByRole('button', { name: /load more bids/i });
    await user.click(loadMoreBtn);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('prevents pagination starvation by querying per status group (Finding 3)', () => {
    // Scenario: User has active bids, but query receives calls with specific status keys
    const calledStatuses: string[] = [];

    vi.spyOn(bidsApi, 'useMyBids').mockImplementation((status?: string) => {
      if (status) calledStatuses.push(status);
      return {
        data: {
          pages: [
            {
              items: status === 'PENDING' ? [bidActivePending] : [],
              nextCursor: null,
            },
          ],
          pageParams: [null],
        },
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
      } as unknown as ReturnType<typeof bidsApi.useMyBids>;
    });

    renderWithToast(<MyBidsPage />);

    // Verify all 7 bid statuses are queried independently
    expect(calledStatuses).toContain('PENDING');
    expect(calledStatuses).toContain('SHORTLISTED');
    expect(calledStatuses).toContain('COUNTERED');
    expect(calledStatuses).toContain('ACCEPTED');
    expect(calledStatuses).toContain('REJECTED');
    expect(calledStatuses).toContain('WITHDRAWN');
    expect(calledStatuses).toContain('DECLINED');

    // Active tab shows the pending bid without being masked by closed bids
    expect(screen.getByTestId('tab-active')).toHaveTextContent('Active (1)');
    expect(screen.getByText('Active Website Development')).toBeInTheDocument();
  });

  it('renders ErrorState with retry on active tab when query fails', async () => {
    const user = userEvent.setup();
    const mockRefetch = vi.fn();

    vi.spyOn(bidsApi, 'useMyBids').mockImplementation((status?: string) => {
      if (status === 'PENDING') {
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          error: new Error('Failed to load pending bids'),
          refetch: mockRefetch,
        } as unknown as ReturnType<typeof bidsApi.useMyBids>;
      }
      return {
        data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof bidsApi.useMyBids>;
    });

    renderWithToast(<MyBidsPage />);

    expect(screen.getByText('Failed to load active bids')).toBeInTheDocument();
    expect(screen.getByText('Failed to load pending bids')).toBeInTheDocument();
    expect(screen.queryByText('No active bids')).not.toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await user.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('renders ErrorState on accepted tab when query fails', async () => {
    const user = userEvent.setup();
    const mockRefetch = vi.fn();

    vi.spyOn(bidsApi, 'useMyBids').mockImplementation((status?: string) => {
      if (status === 'ACCEPTED') {
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          error: new Error('Accepted fetch error'),
          refetch: mockRefetch,
        } as unknown as ReturnType<typeof bidsApi.useMyBids>;
      }
      return {
        data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof bidsApi.useMyBids>;
    });

    renderWithToast(<MyBidsPage />);

    await user.click(screen.getByTestId('tab-accepted'));

    expect(screen.getByText('Failed to load accepted bids')).toBeInTheDocument();
    expect(screen.getByText('Accepted fetch error')).toBeInTheDocument();
    expect(screen.queryByText('No accepted bids yet')).not.toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await user.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('renders ErrorState on closed tab when query fails', async () => {
    const user = userEvent.setup();
    const mockRefetch = vi.fn();

    vi.spyOn(bidsApi, 'useMyBids').mockImplementation((status?: string) => {
      if (status === 'REJECTED') {
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          error: new Error('Closed fetch error'),
          refetch: mockRefetch,
        } as unknown as ReturnType<typeof bidsApi.useMyBids>;
      }
      return {
        data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof bidsApi.useMyBids>;
    });

    renderWithToast(<MyBidsPage />);

    await user.click(screen.getByTestId('tab-closed'));

    expect(screen.getByText('Failed to load closed bids')).toBeInTheDocument();
    expect(screen.getByText('Closed fetch error')).toBeInTheDocument();
    expect(screen.queryByText('No closed bids')).not.toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await user.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('isolates user sessions: log in as A -> load my bids -> logout -> log in as B -> no A data rendered, and a refetch happens (Finding 1)', async () => {
    vi.restoreAllMocks();

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 1000 * 60 } },
    });

    const userA = {
      id: 'user-A',
      email: 'a@market.test',
      displayName: 'User A',
      role: 'USER' as const,
      isBusiness: false,
      createdAt: '2026-01-01T00:00:00Z',
    };
    const userB = {
      id: 'user-B',
      email: 'b@market.test',
      displayName: 'User B',
      role: 'USER' as const,
      isBusiness: false,
      createdAt: '2026-01-01T00:00:00Z',
    };

    let currentUser: typeof userA | null = userA;
    const authState: authContext.AuthContextValue = {
      get user() {
        return currentUser;
      },
      token: 'token-val',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(() => {
        currentUser = null;
        queryClient.clear();
        return Promise.resolve();
      }),
      refresh: vi.fn(),
    };

    vi.spyOn(authContext, 'useAuth').mockImplementation(() => authState);
    vi.spyOn(authContext, 'useViewerId').mockImplementation(() => currentUser?.id ?? null);

    const bidA = makeBidWithListing({
      id: 'bid-A',
      amountCents: 10000,
      status: 'PENDING',
      listing: makeListingSummary({ title: 'Listing For User A' }),
    });

    const bidB = makeBidWithListing({
      id: 'bid-B',
      amountCents: 20000,
      status: 'PENDING',
      listing: makeListingSummary({ title: 'Listing For User B' }),
    });

    const apiGetSpy = vi.spyOn(api, 'get').mockImplementation((path, config) => {
      if (typeof path === 'string' && path.includes('/bids/mine')) {
        const status = (config?.params as Record<string, unknown> | undefined)?.status;
        if (status === 'PENDING') {
          if (currentUser?.id === 'user-A') {
            return Promise.resolve({ items: [bidA], nextCursor: null });
          }
          if (currentUser?.id === 'user-B') {
            return Promise.resolve({ items: [bidB], nextCursor: null });
          }
        }
        return Promise.resolve({ items: [], nextCursor: null });
      }
      return Promise.resolve({ items: [], nextCursor: null });
    });

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MyBidsPage />
        </ToastProvider>
      </QueryClientProvider>,
    );

    // 1. Log in as A -> load my bids -> A data rendered
    await waitFor(() => {
      expect(screen.getByText('Listing For User A')).toBeInTheDocument();
    });
    expect(screen.queryByText('Listing For User B')).not.toBeInTheDocument();

    const initialFetchCount = apiGetSpy.mock.calls.length;

    // 2. Logout -> query cache cleared
    await authState.logout();

    // 3. Log in as B -> rerender
    currentUser = userB;
    rerender(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MyBidsPage />
        </ToastProvider>
      </QueryClientProvider>,
    );

    // 4. Refetch happens, user B data is rendered, user A data is NOT rendered
    await waitFor(() => {
      expect(screen.getByText('Listing For User B')).toBeInTheDocument();
    });
    expect(screen.queryByText('Listing For User A')).not.toBeInTheDocument();
    expect(apiGetSpy.mock.calls.length).toBeGreaterThan(initialFetchCount);
  });
});
