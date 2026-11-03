import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ListingDetailPage from './[id]/page';
import * as listingsApi from '@/lib/api/listings';
import * as bidsApi from '@/lib/api/bids';
import * as authContext from '@/components/auth/auth-provider';
import { ApiError } from '@/lib/api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import type { ListingDetail } from '@/lib/api/types';
import { makeBid, makeListingDetail, makePublicUser } from '../../../test/fixtures';

function renderWithToast(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'listing-123' }),
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/listings/listing-123',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Listing Detail Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockListing: ListingDetail = makeListingDetail({
    id: 'listing-123',
    title: 'Brand Identity Design',
    description: 'Complete brand guide, vector logos, typography and color palettes.',
    kind: 'OFFER',
    status: 'OPEN',
    priceType: 'FIXED',
    priceMinCents: 120000,
    priceMaxCents: 120000,
    currency: 'USD',
    deliveryDays: 10,
    location: 'Remote',
    tags: ['branding', 'design'],
    categoryId: 'c-design',
    categoryName: 'Design',
    category: { id: 'c-design', name: 'Design', slug: 'design' },
    owner: makePublicUser({
      id: 'user-owner',
      displayName: 'Creative Studio',
      isBusiness: true,
      companyName: 'Studio Inc',
      ratingAvg: 4.9,
      ratingCount: 20,
      completedCount: 15,
      createdAt: '2026-01-01T00:00:00Z',
    }),
    images: [],
    attachments: [],
    bidCount: 5,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  });

  it('renders listing overview, price, tags, and owner information', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
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

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByText('Brand Identity Design')).toBeInTheDocument();
    expect(screen.getByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText('Creative Studio')).toBeInTheDocument();
    expect(screen.getByText('Studio Inc')).toBeInTheDocument();
    expect(screen.getByText('branding')).toBeInTheDocument();
  });

  it('shows owner actions (Edit, Close, Delete) when authenticated as owner', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'owner@test.com',
        displayName: 'Creative Studio',
        role: 'USER',
        isBusiness: true,
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

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByRole('link', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('gates useListing on !authLoading (Finding 8)', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'owner-viewer-1',
        email: 'owner@test.com',
        displayName: 'Owner',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-token',
      isLoading: true, // Auth is loading
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    const useListingSpy = vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    // When auth is loading, useListing query is disabled to prevent anonymous 404 for DRAFT
    expect(useListingSpy).toHaveBeenCalledWith(
      'listing-123',
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it('does not show Edit button for non-editable statuses (Finding 5)', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'owner@test.com',
        displayName: 'Creative Studio',
        role: 'USER',
        isBusiness: true,
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

    const closedListing: ListingDetail = {
      ...mockListing,
      status: 'CLOSED',
    };

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: closedListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
  });

  it('shows action buttons for non-owner', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-other',
        email: 'other@test.com',
        displayName: 'Other User',
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

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByRole('button', { name: /place a bid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /message owner/i })).toBeInTheDocument();
  });

  it('renders not found empty state when listing returns 404', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
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

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, 'Listing not found', 'NOT_FOUND'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByText('Listing Not Found')).toBeInTheDocument();
  });

  it('redirects logged out users to login with next param when clicking Place a Bid', async () => {
    const user = userEvent.setup();
    mockPush.mockReset();

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
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

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    const bidBtn = screen.getByRole('button', { name: /place a bid/i });
    await user.click(bidBtn);

    expect(mockPush).toHaveBeenCalledWith('/login?next=/listings/listing-123');
  });

  it('shows Your Bid section with Edit and Withdraw instead of Place a Bid when user has active bid', async () => {
    const user = userEvent.setup();
    const mockWithdraw = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bidder@test.com',
        displayName: 'Alice Bidder',
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

    const listingWithMyBid: ListingDetail = {
      ...mockListing,
      myBid: makeBid({
        id: 'bid-my-1',
        amountCents: 11000,
        deliveryDays: 4,
        status: 'PENDING',
        message: 'My special offer',
      }),
    };

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: listingWithMyBid,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    vi.spyOn(bidsApi, 'useWithdrawBid').mockReturnValue({
      mutateAsync: mockWithdraw,
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useWithdrawBid>);

    renderWithToast(<ListingDetailPage />);

    // Place a bid should not be present
    expect(screen.queryByRole('button', { name: /^place a bid$/i })).not.toBeInTheDocument();

    // Your Bid section should be present
    expect(screen.getByTestId('your-bid-section')).toBeInTheDocument();
    expect(screen.getByText('Your Bid')).toBeInTheDocument();
    expect(screen.getByText('$110')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit bid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument();

    // Clicking Withdraw opens confirm dialog
    await user.click(screen.getByRole('button', { name: /withdraw/i }));
    expect(screen.getByText(/Are you sure you want to withdraw your bid\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^withdraw bid$/i }));
    await waitFor(() => {
      expect(mockWithdraw).toHaveBeenCalledWith('bid-my-1');
    });
  });

  it('handles 409 conflict gracefully during withdraw by closing dialog, toasting, and refetching', async () => {
    const user = userEvent.setup();
    const mockRefetch = vi.fn();
    const conflictError = new ApiError(409, 'Conflict', 'CONFLICT');
    const mockWithdraw = vi.fn().mockRejectedValue(conflictError);

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bidder@test.com',
        displayName: 'Bidder User',
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

    const listingWithMyBid: ListingDetail = {
      ...mockListing,
      myBid: makeBid({
        id: 'bid-my-1',
        amountCents: 11000,
        status: 'PENDING',
      }),
    };

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: listingWithMyBid,
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    vi.spyOn(bidsApi, 'useWithdrawBid').mockReturnValue({
      mutateAsync: mockWithdraw,
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useWithdrawBid>);

    renderWithToast(<ListingDetailPage />);

    await user.click(screen.getByRole('button', { name: /withdraw/i }));
    expect(screen.getByText(/Are you sure you want to withdraw your bid\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^withdraw bid$/i }));

    await waitFor(() => {
      expect(mockWithdraw).toHaveBeenCalledWith('bid-my-1');
      expect(
        screen.getByText(/This bid changed or was already closed\. Refreshing\.\.\./i),
      ).toBeInTheDocument();
      expect(mockRefetch).toHaveBeenCalled();
    });
    expect(
      screen.queryByText(/Are you sure you want to withdraw your bid\?/i),
    ).not.toBeInTheDocument();
  });

  it('loads full bid detail with attachments when opening Edit Bid dialog', async () => {
    const user = userEvent.setup();

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bidder@test.com',
        displayName: 'Bidder User',
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

    const listingWithMyBid: ListingDetail = {
      ...mockListing,
      myBid: makeBid({
        id: 'bid-my-1',
        amountCents: 11000,
        status: 'PENDING',
        attachments: undefined,
      }),
    };

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: listingWithMyBid,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    vi.spyOn(bidsApi, 'useBid').mockReturnValue({
      data: {
        ...listingWithMyBid.myBid,
        attachments: [
          {
            id: 'att-edit-1',
            key: 'uploads/att-edit-1.pdf',
            fileName: 'portfolio.pdf',
            sizeBytes: 2048,
            mimeType: 'application/pdf',
          },
        ],
        revisions: [],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useBid>);

    renderWithToast(<ListingDetailPage />);

    await user.click(screen.getByRole('button', { name: /edit bid/i }));

    expect(screen.getByRole('heading', { name: /edit your proposal/i })).toBeInTheDocument();
    expect(screen.getByText('portfolio.pdf')).toBeInTheDocument();
  });

  it('renders owner bids compare section when viewer is listing owner', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'owner@test.com',
        displayName: 'Creative Studio',
        role: 'USER',
        isBusiness: true,
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

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    renderWithToast(<ListingDetailPage />);

    // Owner should see Bids section
    expect(screen.getByText(/Bids \(5\)/i)).toBeInTheDocument();
    // Owner should not see "Place a bid"
    expect(screen.queryByRole('button', { name: /place a bid/i })).not.toBeInTheDocument();
  });

  it('treats a WITHDRAWN myBid as no active bid: shows Place a Bid and links to previous thread (Finding 3)', async () => {
    const user = userEvent.setup();

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bidder@test.com',
        displayName: 'Alice Bidder',
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

    const listingWithWithdrawnBid: ListingDetail = {
      ...mockListing,
      myBid: makeBid({
        id: 'bid-withdrawn-1',
        amountCents: 11000,
        status: 'WITHDRAWN',
      }),
    };

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: listingWithWithdrawnBid,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    // Place a bid button SHOULD be visible
    const placeBidBtn = screen.getByRole('button', { name: /^place a bid$/i });
    expect(placeBidBtn).toBeInTheDocument();

    // Your Bid active section should NOT be visible
    expect(screen.queryByTestId('your-bid-section')).not.toBeInTheDocument();

    // Link to previous bid thread should be visible
    expect(screen.getByText(/Previous bid \(withdrawn\):/i)).toBeInTheDocument();
    const threadLink = screen.getByRole('link', { name: /view thread/i });
    expect(threadLink).toHaveAttribute('href', '/bids/bid-withdrawn-1');

    // Clicking Place a Bid opens the dialog in create mode (not edit)
    await user.click(placeBidBtn);
    expect(screen.getByRole('heading', { name: 'Place a Bid' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Edit Your Proposal' })).not.toBeInTheDocument();
  });

  it('treats a REJECTED myBid as no active bid: shows Place a Bid and links to previous thread (Finding 3)', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-bidder',
        email: 'bidder@test.com',
        displayName: 'Alice Bidder',
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

    const listingWithRejectedBid: ListingDetail = {
      ...mockListing,
      myBid: makeBid({
        id: 'bid-rejected-1',
        amountCents: 12000,
        status: 'REJECTED',
      }),
    };

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: listingWithRejectedBid,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByRole('button', { name: /^place a bid$/i })).toBeInTheDocument();
    expect(screen.queryByTestId('your-bid-section')).not.toBeInTheDocument();
    expect(screen.getByText(/Previous bid \(rejected\):/i)).toBeInTheDocument();
    const threadLink = screen.getByRole('link', { name: /view thread/i });
    expect(threadLink).toHaveAttribute('href', '/bids/bid-rejected-1');
  });
});
