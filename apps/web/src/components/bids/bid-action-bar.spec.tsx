import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidActionBar } from './bid-action-bar';
import { useBidActions } from './use-bid-actions';
import * as bidsApi from '@/lib/api/bids';
import { ApiError } from '@/lib/api/client';
import { ToastProvider } from '@/components/ui/toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeBid, makePublicUser } from '../../../test/fixtures';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  }
  return TestWrapper;
}

describe('BidActionBar component', () => {
  const mockBid = makeBid({
    id: 'bid-test-1',
    status: 'PENDING',
    bidder: makePublicUser({ id: 'bidder-1', displayName: 'Jane Dev' }),
  });

  it('renders table layout with action buttons', async () => {
    const user = userEvent.setup();
    const onShortlist = vi.fn();
    const onCounter = vi.fn();
    const onReject = vi.fn();
    const onAccept = vi.fn();

    render(
      <BidActionBar
        bid={mockBid}
        listingIsOpen={true}
        isOwner={true}
        onShortlist={onShortlist}
        onCounter={onCounter}
        onReject={onReject}
        onAccept={onAccept}
        layout="table"
      />,
    );

    const shortlistBtn = screen.getByRole('button', { name: "Shortlist Jane Dev's bid" });
    const counterBtn = screen.getByRole('button', { name: "Counter Jane Dev's bid" });
    const rejectBtn = screen.getByRole('button', { name: "Reject Jane Dev's bid" });
    const acceptBtn = screen.getByRole('button', { name: "Accept Jane Dev's bid" });

    expect(shortlistBtn).toBeEnabled();
    expect(counterBtn).toBeEnabled();
    expect(rejectBtn).toBeEnabled();
    expect(acceptBtn).toBeEnabled();

    await user.click(shortlistBtn);
    expect(onShortlist).toHaveBeenCalledWith(mockBid);

    await user.click(counterBtn);
    expect(onCounter).toHaveBeenCalledWith(mockBid);

    await user.click(rejectBtn);
    expect(onReject).toHaveBeenCalledWith(mockBid);

    await user.click(acceptBtn);
    expect(onAccept).toHaveBeenCalledWith(mockBid);
  });

  it('renders grid layout for mobile cards', () => {
    render(
      <BidActionBar
        bid={mockBid}
        listingIsOpen={true}
        isOwner={true}
        onShortlist={vi.fn()}
        onCounter={vi.fn()}
        onReject={vi.fn()}
        onAccept={vi.fn()}
        layout="grid"
      />,
    );

    expect(screen.getByRole('button', { name: 'Shortlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Counter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });

  it('disables all buttons when listing is closed or viewer is not owner', () => {
    render(
      <BidActionBar
        bid={mockBid}
        listingIsOpen={false}
        isOwner={true}
        onShortlist={vi.fn()}
        onCounter={vi.fn()}
        onReject={vi.fn()}
        onAccept={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: "Shortlist Jane Dev's bid" })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Counter Jane Dev's bid" })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Reject Jane Dev's bid" })).toBeDisabled();
    expect(screen.getByRole('button', { name: "Accept Jane Dev's bid" })).toBeDisabled();
  });
});

describe('useBidActions hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
  });

  const mockBid = makeBid({
    id: 'bid-hook-1',
    status: 'PENDING',
    bidder: makePublicUser({ id: 'bidder-h', displayName: 'Hook Bidder' }),
  });

  it('opens and closes dialogs properly', () => {
    const { result } = renderHook(() => useBidActions(), { wrapper: createWrapper() });

    expect(result.current.selectedBid).toBeNull();
    expect(result.current.counterDialogOpen).toBe(false);

    act(() => {
      result.current.openCounter(mockBid);
    });
    expect(result.current.selectedBid).toBe(mockBid);
    expect(result.current.counterDialogOpen).toBe(true);

    act(() => {
      result.current.openReject(mockBid);
    });
    expect(result.current.rejectDialogOpen).toBe(true);

    act(() => {
      result.current.openAccept(mockBid);
    });
    expect(result.current.acceptDialogOpen).toBe(true);

    act(() => {
      result.current.closeAllDialogs();
    });
    expect(result.current.counterDialogOpen).toBe(false);
    expect(result.current.rejectDialogOpen).toBe(false);
    expect(result.current.acceptDialogOpen).toBe(false);
  });

  it('closes all dialogs on 409 conflict and triggers refetch', async () => {
    const mockRefetch = vi.fn();
    const conflictError = new ApiError(409, 'Conflict', 'CONFLICT');

    vi.spyOn(bidsApi, 'useRejectBid').mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue(conflictError),
      isPending: false,
    } as unknown as ReturnType<typeof bidsApi.useRejectBid>);

    const { result } = renderHook(() => useBidActions({ refetch: mockRefetch }), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.openReject(mockBid);
    });
    expect(result.current.rejectDialogOpen).toBe(true);

    await act(async () => {
      await result.current.handleConfirmReject('Not suitable');
    });

    // Dialog should be closed on 409
    expect(result.current.rejectDialogOpen).toBe(false);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
