import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BidDetailPage from './[id]/page';
import * as bidsApi from '@/lib/api/bids';
import * as listingsApi from '@/lib/api/listings';
import * as authContext from '@/components/auth/auth-provider';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/client';
import {
  makeBidDetail,
  makeBidRevision,
  makeListingSummary,
  makePublicUser,
} from '../../../test/fixtures';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'bid-thread-1' }),
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/bids/bid-thread-1',
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

describe('BidDetailPage (Negotiation Thread)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  const mockListing = makeListingSummary({
    id: 'listing-1',
    title: 'Brand Identity Redesign',
    owner: makePublicUser({
      id: 'user-owner',
      displayName: 'Alice Owner',
    }),
  });

  const mockBidCountered = makeBidDetail({
    id: 'bid-thread-1',
    listingId: 'listing-1',
    listing: mockListing,
    status: 'COUNTERED',
    amountCents: 18000,
    deliveryDays: 6,
    message: 'I can deliver everything in 6 days.',
    bidder: makePublicUser({
      id: 'user-bidder',
      displayName: 'Bob Bidder',
    }),
    revisions: [
      makeBidRevision({
        id: 'rev-1',
        authorId: 'user-bidder',
        amountCents: 20000,
        deliveryDays: 7,
        message: 'Initial bid proposal',
        author: makePublicUser({ id: 'user-bidder', displayName: 'Bob Bidder' }),
        createdAt: new Date('2026-10-02T10:00:00Z'),
      }),
      makeBidRevision({
        id: 'rev-2',
        authorId: 'user-owner',
        amountCents: 18000,
        deliveryDays: 6,
        message: 'Could you do $180 and 6 days?',
        author: makePublicUser({ id: 'user-owner', displayName: 'Alice Owner' }),
        createdAt: new Date('2026-10-02T12:00:00Z'),
      }),
    ],
  });

  it('renders timeline with revision history and status badge', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bob@bidder.test',
        displayName: 'Bob Bidder',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-bidder',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: mockBidCountered,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    renderWithToast(<BidDetailPage />);

    expect(screen.getByText('Negotiation Thread')).toBeInTheDocument();
    expect(screen.getByText('Countered')).toBeInTheDocument();
    expect(screen.getByText('Brand Identity Redesign')).toBeInTheDocument();
    expect(screen.getByText('Negotiation History')).toBeInTheDocument();

    // Revisions
    expect(screen.getByText('Initial bid proposal')).toBeInTheDocument();
    expect(screen.getByText('Could you do $180 and 6 days?')).toBeInTheDocument();
    expect(screen.getByText('$200')).toBeInTheDocument();
    expect(screen.getAllByText('$180').length).toBeGreaterThan(0);
  });

  it('allows bidder to accept counter-offer and navigates to agreement', async () => {
    const user = userEvent.setup();
    const mockAcceptCounter = vi.fn().mockResolvedValue({
      bid: mockBidCountered,
      agreement: { id: 'agr-success-999' },
    });

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bob@bidder.test',
        displayName: 'Bob Bidder',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-bidder',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: mockBidCountered,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    vi.spyOn(bidsApi, 'useAcceptCounter').mockReturnValue({
      mutateAsync: mockAcceptCounter,
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useAcceptCounter>);

    renderWithToast(<BidDetailPage />);

    const acceptCounterBtn = screen.getByRole('button', { name: /accept counter-offer/i });
    expect(acceptCounterBtn).toBeInTheDocument();
    await user.click(acceptCounterBtn);

    expect(
      screen.getByText(
        /Accept the owner's proposed terms\? This will formalize the project agreement/i,
      ),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /accept & start project/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockAcceptCounter).toHaveBeenCalledWith('bid-thread-1');
      expect(mockPush).toHaveBeenCalledWith('/agreements/agr-success-999');
    });
  });

  it('renders owner actions when authenticated as owner', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'alice@owner.test',
        displayName: 'Alice Owner',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-owner',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: mockBidCountered,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    renderWithToast(<BidDetailPage />);

    expect(screen.getByRole('button', { name: /shortlist/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /counter-offer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept proposal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /message bidder/i })).toBeInTheDocument();
  });

  it('shows message placeholder dialog when clicking Message button', async () => {
    const user = userEvent.setup();

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bob@bidder.test',
        displayName: 'Bob Bidder',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-bidder',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: mockBidCountered,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    renderWithToast(<BidDetailPage />);

    const messageBtn = screen.getByRole('button', { name: /message owner/i });
    await user.click(messageBtn);

    expect(
      screen.getByText(
        'Direct 1:1 real-time messaging and chat will be implemented in task WEB-04.',
      ),
    ).toBeInTheDocument();
  });

  it('shows unauthorized access state when viewer is neither bidder nor owner', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-stranger',
        email: 'stranger@test.com',
        displayName: 'Stranger User',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-stranger',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: mockBidCountered,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    renderWithToast(<BidDetailPage />);

    expect(screen.getByText('Unauthorized Access')).toBeInTheDocument();
  });

  it('shows error state when bid query returns 404', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bob@bidder.test',
        displayName: 'Bob Bidder',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-bidder',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, 'Bid not found', 'NOT_FOUND'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    renderWithToast(<BidDetailPage />);

    expect(screen.getByText('Proposal not found')).toBeInTheDocument();
  });

  it('closes action dialog and refetches when encountering 409 conflict', async () => {
    const user = userEvent.setup();
    const mockRefetch = vi.fn();
    const conflictError = new ApiError(409, 'Conflict', 'CONFLICT');

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bob@bidder.test',
        displayName: 'Bob Bidder',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-bidder',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: mockBidCountered,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    vi.spyOn(bidsApi, 'useWithdrawBid').mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(conflictError),
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useWithdrawBid>);

    renderWithToast(<BidDetailPage />);

    await user.click(screen.getByRole('button', { name: /withdraw proposal/i }));
    expect(screen.getByText(/Are you sure you want to withdraw this bid\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^withdraw bid$/i }));

    await waitFor(() => {
      expect(screen.getByText('This bid changed, refresh.')).toBeInTheDocument();
      expect(mockRefetch).toHaveBeenCalled();
    });

    expect(
      screen.queryByText(/Are you sure you want to withdraw this bid\?/i),
    ).not.toBeInTheDocument();
  });

  it('shows accept/counter controls and no "Unauthorized" for listing owner when bid response has no listing', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'alice@owner.test',
        displayName: 'Alice Owner',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-owner',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    // Bid response does not include listing (API contract)
    const bidWithoutListing = makeBidDetail({
      id: 'bid-thread-1',
      listingId: 'listing-1',
      listing: undefined,
      status: 'PENDING',
      amountCents: 15000,
      deliveryDays: 5,
      bidder: makePublicUser({
        id: 'user-bidder',
        displayName: 'Bob Bidder',
      }),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: bidWithoutListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    // Listing is fetched separately by useListing hook
    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<BidDetailPage />);

    // No unauthorized screen
    expect(screen.queryByText('Unauthorized Access')).not.toBeInTheDocument();

    // Owner controls are displayed
    expect(screen.getByRole('button', { name: /accept proposal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /counter-offer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /shortlist/i })).toBeInTheDocument();

    // Derived listing title and owner card
    expect(screen.getByText('Brand Identity Redesign')).toBeInTheDocument();
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
  });

  it('renders bidder path when bid response has no listing', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bob@bidder.test',
        displayName: 'Bob Bidder',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-bidder',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const bidWithoutListing = makeBidDetail({
      id: 'bid-thread-1',
      listingId: 'listing-1',
      listing: undefined,
      status: 'PENDING',
      amountCents: 15000,
      deliveryDays: 5,
      bidder: makePublicUser({
        id: 'user-bidder',
        displayName: 'Bob Bidder',
      }),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: bidWithoutListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<BidDetailPage />);

    expect(screen.queryByText('Unauthorized Access')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit proposal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw proposal/i })).toBeInTheDocument();
    expect(screen.getByText('Brand Identity Redesign')).toBeInTheDocument();
  });

  it('keeps bidder path working without listing when listing is absent', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bob@bidder.test',
        displayName: 'Bob Bidder',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-bidder',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const bidWithoutListing = makeBidDetail({
      id: 'bid-thread-1',
      listingId: 'listing-1',
      listing: undefined,
      status: 'PENDING',
      amountCents: 15000,
      deliveryDays: 5,
      bidder: makePublicUser({
        id: 'user-bidder',
        displayName: 'Bob Bidder',
      }),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: bidWithoutListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<BidDetailPage />);

    expect(screen.queryByText('Unauthorized Access')).not.toBeInTheDocument();
    expect(screen.getByText('Proposal for Listing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw proposal/i })).toBeInTheDocument();
  });

  it('shows loading state while listing is loading', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'alice@owner.test',
        displayName: 'Alice Owner',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-owner',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const bidWithoutListing = makeBidDetail({
      id: 'bid-thread-1',
      listingId: 'listing-1',
      listing: undefined,
      bidder: makePublicUser({
        id: 'user-bidder',
        displayName: 'Bob Bidder',
      }),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: bidWithoutListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    const { container } = renderWithToast(<BidDetailPage />);

    // Skeleton elements are displayed
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('Negotiation Thread')).not.toBeInTheDocument();
  });

  it('shows listing fetch error state with retry when listing fails to load', async () => {
    const user = userEvent.setup();
    const mockRefetchListing = vi.fn();

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'alice@owner.test',
        displayName: 'Alice Owner',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-owner',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const bidWithoutListing = makeBidDetail({
      id: 'bid-thread-1',
      listingId: 'listing-1',
      listing: undefined,
      bidder: makePublicUser({
        id: 'user-bidder',
        displayName: 'Bob Bidder',
      }),
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: bidWithoutListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, 'Listing not found', 'NOT_FOUND'),
      refetch: mockRefetchListing,
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<BidDetailPage />);

    expect(screen.getByText('Failed to load listing')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /try again/i });
    expect(retryBtn).toBeInTheDocument();

    await user.click(retryBtn);
    expect(mockRefetchListing).toHaveBeenCalledTimes(1);
  });

  it('renders bid attachments (image thumbnail and file download link)', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'alice@owner.test',
        displayName: 'Alice Owner',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-owner',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const bidWithAttachments = makeBidDetail({
      id: 'bid-thread-1',
      listingId: 'listing-1',
      listing: mockListing,
      status: 'PENDING',
      attachments: [
        {
          id: 'att-1',
          key: 'uploads/mock-design.png',
          fileName: 'mock-design.png',
          mimeType: 'image/png',
          sizeBytes: 1024 * 500,
          url: 'http://localhost:4000/files/mock-design.png',
        },
        {
          id: 'att-2',
          key: 'uploads/deliverable-plan.pdf',
          fileName: 'deliverable-plan.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024 * 1024 * 1.5,
          url: 'http://localhost:4000/files/deliverable-plan.pdf',
        },
      ],
    });

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: bidWithAttachments,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    renderWithToast(<BidDetailPage />);

    expect(screen.getByText(/Attachments \(2\)/i)).toBeInTheDocument();

    // Image thumbnail
    const imageThumb = screen.getByRole('img', { name: 'mock-design.png' });
    expect(imageThumb).toBeInTheDocument();
    expect(imageThumb).toHaveAttribute('src', 'http://localhost:4000/files/mock-design.png');

    // Document download link
    const pdfLink = screen.getByRole('link', {
      name: /download deliverable-plan\.pdf \(1\.5 MB\)/i,
    });
    expect(pdfLink).toBeInTheDocument();
    expect(pdfLink).toHaveAttribute('href', 'http://localhost:4000/files/deliverable-plan.pdf');
    expect(screen.getByText('deliverable-plan.pdf')).toBeInTheDocument();
    expect(screen.getByText('(1.5 MB)')).toBeInTheDocument();
  });
});
