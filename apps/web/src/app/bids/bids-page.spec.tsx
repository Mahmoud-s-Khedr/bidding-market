import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyBidsPage from './page';
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

    vi.spyOn(bidsApi, 'useMyBids').mockReturnValue({
      data: {
        pages: [
          {
            items: [bidActivePending, bidActiveCountered, bidAccepted, bidClosedRejected],
            nextCursor: null,
          },
        ],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useMyBids>);

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
    vi.spyOn(bidsApi, 'useMyBids').mockReturnValue({
      data: {
        pages: [{ items: [bidActivePending], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useMyBids>);

    renderWithToast(<MyBidsPage />);

    const viewProposalLink = screen.getByRole('link', { name: /view proposal/i });
    expect(viewProposalLink).toHaveAttribute('href', '/bids/bid-pending-1');

    const listingTitleLink = screen.getByRole('link', { name: 'Active Website Development' });
    expect(listingTitleLink).toHaveAttribute('href', '/listings/listing-pending');
  });

  it('renders empty states when no bids exist for a tab', async () => {
    const user = userEvent.setup();

    vi.spyOn(bidsApi, 'useMyBids').mockReturnValue({
      data: {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useMyBids>);

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

    vi.spyOn(bidsApi, 'useMyBids').mockReturnValue({
      data: {
        pages: [{ items: [bidActivePending], nextCursor: 'cur-next' }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage,
    } as unknown as ReturnType<typeof bidsApi.useMyBids>);

    renderWithToast(<MyBidsPage />);

    const loadMoreBtn = screen.getByRole('button', { name: /load more bids/i });
    await user.click(loadMoreBtn);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
