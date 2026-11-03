import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListingBidsSection } from './listing-bids-section';
import * as bidsApi from '@/lib/api/bids';
import { ToastProvider } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/client';
import { makeBid, makeListingDetail, makePublicUser } from '../../../test/fixtures';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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

describe('ListingBidsSection Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  const mockListing = makeListingDetail({
    id: 'listing-100',
    title: 'Full Stack App',
    bidCount: 2,
  });

  const bidPending = makeBid({
    id: 'bid-pending',
    listingId: 'listing-100',
    status: 'PENDING',
    amountCents: 15000,
    deliveryDays: 5,
    message: 'Expert delivery within 5 days',
    bidder: makePublicUser({
      id: 'bidder-1',
      displayName: 'Alice Freelancer',
      ratingAvg: 4.8,
      completedCount: 12,
    }),
  });

  const bidAccepted = makeBid({
    id: 'bid-accepted',
    listingId: 'listing-100',
    status: 'ACCEPTED',
    amountCents: 14000,
    deliveryDays: 7,
    message: 'Completed offer',
    bidder: makePublicUser({
      id: 'bidder-2',
      displayName: 'Bob Dev',
      ratingAvg: 5.0,
      completedCount: 20,
    }),
  });

  it('renders compare table with bidder, amount, delivery, and message excerpt', () => {
    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [bidPending, bidAccepted], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    expect(screen.getByText(/Bids \(2\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('Alice Freelancer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$150').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5 days/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Expert delivery within 5 days/i).length).toBeGreaterThan(0);

    expect(screen.getAllByText('Bob Dev').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0);
  });

  it('disables actions that are invalid according to the state machine', () => {
    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [bidPending, bidAccepted], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    // For bidPending (PENDING), Shortlist, Counter, Reject, Accept should all be enabled
    const shortlistPendingBtn = screen.getByRole('button', {
      name: `Shortlist ${bidPending.bidder.displayName}'s bid`,
    });
    expect(shortlistPendingBtn).toBeEnabled();

    // For bidAccepted (ACCEPTED), owner actions should be disabled
    const shortlistAcceptedBtn = screen.getByRole('button', {
      name: `Shortlist ${bidAccepted.bidder.displayName}'s bid`,
    });
    expect(shortlistAcceptedBtn).toBeDisabled();

    const acceptAcceptedBtn = screen.getByRole('button', {
      name: `Accept ${bidAccepted.bidder.displayName}'s bid`,
    });
    expect(acceptAcceptedBtn).toBeDisabled();
  });

  it('handles Shortlist action click', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(bidPending);

    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [bidPending], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    vi.spyOn(bidsApi, 'useShortlistBid').mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useShortlistBid>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    const shortlistBtn = screen.getByRole('button', {
      name: `Shortlist ${bidPending.bidder.displayName}'s bid`,
    });
    await user.click(shortlistBtn);

    expect(mutateAsync).toHaveBeenCalledWith('bid-pending');
  });

  it('opens Reject dialog, allows reason input, and submits', async () => {
    const user = userEvent.setup();
    const rejectMutateAsync = vi.fn().mockResolvedValue(bidPending);

    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [bidPending], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    vi.spyOn(bidsApi, 'useRejectBid').mockReturnValue({
      mutateAsync: rejectMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useRejectBid>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    const rejectBtn = screen.getByRole('button', {
      name: `Reject ${bidPending.bidder.displayName}'s bid`,
    });
    await user.click(rejectBtn);

    expect(screen.getByRole('heading', { name: /reject bid/i })).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/reason for rejection/i);
    await user.type(reasonInput, 'Budget exceeded');

    const confirmRejectBtn = screen.getByRole('button', { name: /^reject bid$/i });
    await user.click(confirmRejectBtn);

    await waitFor(() => {
      expect(rejectMutateAsync).toHaveBeenCalledWith({
        id: 'bid-pending',
        data: { reason: 'Budget exceeded' },
      });
    });
  });

  it('opens Counter dialog, inputs amount and delivery, and submits payload', async () => {
    const user = userEvent.setup();
    const counterMutateAsync = vi.fn().mockResolvedValue(bidPending);

    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [bidPending], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    vi.spyOn(bidsApi, 'useCounterBid').mockReturnValue({
      mutateAsync: counterMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useCounterBid>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    const counterBtn = screen.getByRole('button', {
      name: `Counter ${bidPending.bidder.displayName}'s bid`,
    });
    await user.click(counterBtn);

    expect(screen.getByRole('heading', { name: /send counter-offer/i })).toBeInTheDocument();

    const amountInput = screen.getByLabelText(/counter amount/i);
    await user.clear(amountInput);
    await user.type(amountInput, '120.00');

    const deliveryInput = screen.getByLabelText(/delivery \(days\)/i);
    await user.clear(deliveryInput);
    await user.type(deliveryInput, '4');

    const messageInput = screen.getByLabelText(/message to bidder/i);
    await user.type(messageInput, 'Could we finish within 4 days?');

    const submitCounterBtn = screen.getByRole('button', { name: /send counter-offer/i });
    await user.click(submitCounterBtn);

    await waitFor(() => {
      expect(counterMutateAsync).toHaveBeenCalledWith({
        id: 'bid-pending',
        data: {
          amountCents: 12000,
          deliveryDays: 4,
          message: 'Could we finish within 4 days?',
        },
      });
    });
  });

  it('opens Accept confirm dialog, accepts bid, and navigates to agreement', async () => {
    const user = userEvent.setup();
    const acceptMutateAsync = vi.fn().mockResolvedValue({
      bid: bidPending,
      agreement: { id: 'agreement-789' },
    });

    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [bidPending], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    vi.spyOn(bidsApi, 'useAcceptBid').mockReturnValue({
      mutateAsync: acceptMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useAcceptBid>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    const acceptBtn = screen.getByRole('button', {
      name: `Accept ${bidPending.bidder.displayName}'s bid`,
    });
    await user.click(acceptBtn);

    expect(
      screen.getByText(/All other active proposals for this listing will be declined/i),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /accept proposal/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(acceptMutateAsync).toHaveBeenCalledWith('bid-pending');
      expect(mockPush).toHaveBeenCalledWith('/agreements/agreement-789');
    });
  });

  it('handles 409 conflict gracefully with toast and triggers refetch', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    const conflictError = new ApiError(409, 'Conflict', 'CONFLICT');

    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [bidPending], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch,
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    vi.spyOn(bidsApi, 'useShortlistBid').mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(conflictError),
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useShortlistBid>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    const shortlistBtn = screen.getByRole('button', {
      name: `Shortlist ${bidPending.bidder.displayName}'s bid`,
    });
    await user.click(shortlistBtn);

    await waitFor(() => {
      expect(screen.getByText('This bid changed, refresh.')).toBeInTheDocument();
      expect(refetch).toHaveBeenCalled();
    });
  });

  it('calls fetchNextPage when clicking load more', async () => {
    const user = userEvent.setup();
    const fetchNextPage = vi.fn();

    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [bidPending], nextCursor: 'cur-2' }],
        pageParams: [null],
      },
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: true,
      fetchNextPage,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    const loadMoreBtn = screen.getByRole('button', { name: /load more proposals/i });
    await user.click(loadMoreBtn);

    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('renders ErrorState with retry when bids query fails (Finding 2)', async () => {
    const user = userEvent.setup();
    const mockRefetch = vi.fn();

    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Failed to load server bids'),
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: mockRefetch,
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    expect(screen.getByText('Failed to load bids')).toBeInTheDocument();
    expect(screen.getByText('Failed to load server bids')).toBeInTheDocument();
    expect(screen.queryByText('No bids received yet')).not.toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await user.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('renders EmptyState when bids query succeeds with zero bids', () => {
    vi.spyOn(bidsApi, 'useListingBids').mockReturnValue({
      data: {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isError: false,
      error: null,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof bidsApi.useListingBids>);

    renderWithToast(<ListingBidsSection listing={mockListing} />);

    expect(screen.getByText('No bids received yet')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load bids')).not.toBeInTheDocument();
  });
});
