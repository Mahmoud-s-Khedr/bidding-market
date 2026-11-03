import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { api } from './client';
import { queryKeys } from './query-keys';
import {
  acceptBid,
  acceptCounter,
  counterBid,
  createBid,
  getBid,
  getListingBids,
  getMyBids,
  rejectBid,
  shortlistBid,
  updateBid,
  useAcceptBid,
  useAcceptCounter,
  useBid,
  useCounterBid,
  useCreateBid,
  useListingBids,
  useMyBids,
  useRejectBid,
  useShortlistBid,
  useUpdateBid,
  useWithdrawBid,
  withdrawBid,
} from './bids';
import { makeBid, makeBidDetail, makeBidWithListing } from '../../../test/fixtures';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    wrapper: function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(QueryClientProvider, { client: queryClient }, children);
    },
  };
}

describe('Bids API client & hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockBid = makeBid({ id: 'bid-123' });
  const mockBidDetail = makeBidDetail({ id: 'bid-123' });
  const mockBidWithListing = makeBidWithListing({ id: 'bid-123' });

  describe('API Functions', () => {
    it('getListingBids issues GET to /listings/:id/bids with params', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
        items: [mockBid],
        nextCursor: null,
      });

      const res = await getListingBids('listing-1', { sort: 'amount_asc', limit: 10 });
      expect(getSpy).toHaveBeenCalledWith('/listings/listing-1/bids', {
        params: { sort: 'amount_asc', cursor: undefined, limit: 10 },
      });
      expect(res.items).toHaveLength(1);
    });

    it('getMyBids issues GET to /bids/mine with status param', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue({
        items: [mockBidWithListing],
        nextCursor: null,
      });

      const res = await getMyBids({ status: 'PENDING' });
      expect(getSpy).toHaveBeenCalledWith('/bids/mine', {
        params: { status: 'PENDING', cursor: undefined, limit: undefined },
      });
      expect(res.items).toHaveLength(1);
    });

    it('getBid issues GET to /bids/:id', async () => {
      const getSpy = vi.spyOn(api, 'get').mockResolvedValue(mockBidDetail);
      const res = await getBid('bid-123');
      expect(getSpy).toHaveBeenCalledWith('/bids/bid-123');
      expect(res.id).toBe('bid-123');
    });

    it('createBid issues POST to /listings/:id/bids', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const input = {
        amountCents: 10000,
        currency: 'USD',
        deliveryDays: 5,
        message: 'Hello',
      };
      const res = await createBid('listing-1', input);
      expect(postSpy).toHaveBeenCalledWith('/listings/listing-1/bids', input);
      expect(res.id).toBe('bid-123');
    });

    it('updateBid issues PATCH to /bids/:id', async () => {
      const patchSpy = vi.spyOn(api, 'patch').mockResolvedValue(mockBidDetail);
      const input = { amountCents: 12000 };
      const res = await updateBid('bid-123', input);
      expect(patchSpy).toHaveBeenCalledWith('/bids/bid-123', input);
      expect(res.id).toBe('bid-123');
    });

    it('withdrawBid issues POST to /bids/:id/withdraw', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const res = await withdrawBid('bid-123');
      expect(postSpy).toHaveBeenCalledWith('/bids/bid-123/withdraw');
      expect(res.id).toBe('bid-123');
    });

    it('shortlistBid issues POST to /bids/:id/shortlist', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const res = await shortlistBid('bid-123');
      expect(postSpy).toHaveBeenCalledWith('/bids/bid-123/shortlist');
      expect(res.id).toBe('bid-123');
    });

    it('rejectBid issues POST to /bids/:id/reject', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const res = await rejectBid('bid-123', { reason: 'Price too high' });
      expect(postSpy).toHaveBeenCalledWith('/bids/bid-123/reject', { reason: 'Price too high' });
      expect(res.id).toBe('bid-123');
    });

    it('counterBid issues POST to /bids/:id/counter', async () => {
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const input = { amountCents: 9000, deliveryDays: 4, message: 'Counter proposal' };
      const res = await counterBid('bid-123', input);
      expect(postSpy).toHaveBeenCalledWith('/bids/bid-123/counter', input);
      expect(res.id).toBe('bid-123');
    });

    it('acceptCounter issues POST to /bids/:id/accept-counter', async () => {
      const mockAcceptRes = {
        bid: mockBid,
        agreement: {
          id: 'agr-1',
          listingId: 'listing-1',
          bidId: 'bid-123',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue(mockAcceptRes);
      const res = await acceptCounter('bid-123');
      expect(postSpy).toHaveBeenCalledWith('/bids/bid-123/accept-counter');
      expect(res.agreement.id).toBe('agr-1');
    });

    it('acceptBid issues POST to /bids/:id/accept', async () => {
      const mockAcceptRes = {
        bid: mockBid,
        agreement: {
          id: 'agr-2',
          listingId: 'listing-1',
          bidId: 'bid-123',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      const postSpy = vi.spyOn(api, 'post').mockResolvedValue(mockAcceptRes);
      const res = await acceptBid('bid-123');
      expect(postSpy).toHaveBeenCalledWith('/bids/bid-123/accept');
      expect(res.agreement.id).toBe('agr-2');
    });
  });

  describe('React Query Hooks', () => {
    it('useListingBids fetches infinite pages and supports nextCursor', async () => {
      vi.spyOn(api, 'get').mockResolvedValue({
        items: [mockBid],
        nextCursor: 'next-cur',
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useListingBids('listing-1', 'newest'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.pages[0]?.items).toHaveLength(1);
      expect(result.current.hasNextPage).toBe(true);
    });

    it('useMyBids fetches user proposals with infinite query', async () => {
      vi.spyOn(api, 'get').mockResolvedValue({
        items: [mockBidWithListing],
        nextCursor: null,
      });

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMyBids('PENDING'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.pages[0]?.items[0]?.id).toBe('bid-123');
    });

    it('useBid queries bid by ID', async () => {
      vi.spyOn(api, 'get').mockResolvedValue(mockBidDetail);

      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useBid('bid-123'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.id).toBe('bid-123');
    });

    it('useCreateBid invalidates listing detail, bids and mine list', async () => {
      vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateBid(), { wrapper });

      await result.current.mutateAsync({
        listingId: 'listing-1',
        data: { amountCents: 10000, currency: 'USD', deliveryDays: 5, message: 'msg' },
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['listings', 'detail', 'listing-1'] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['bids', 'listing', 'listing-1'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.mineAll() });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.bids.detail(mockBidDetail.id),
      });
    });

    it('useUpdateBid invalidates bid details and listing queries', async () => {
      vi.spyOn(api, 'patch').mockResolvedValue(mockBidDetail);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateBid(), { wrapper });

      await result.current.mutateAsync({
        id: 'bid-123',
        data: { amountCents: 15000 },
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['listings', 'detail', mockBidDetail.listingId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['bids', 'listing', mockBidDetail.listingId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.detail('bid-123') });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.mineAll() });
    });

    it('useWithdrawBid invalidates bid details and listing queries', async () => {
      vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useWithdrawBid(), { wrapper });

      await result.current.mutateAsync('bid-123');

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['listings', 'detail', mockBidDetail.listingId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['bids', 'listing', mockBidDetail.listingId],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.detail('bid-123') });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.mineAll() });
    });

    it('useShortlistBid invalidates queries', async () => {
      vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useShortlistBid(), { wrapper });
      await result.current.mutateAsync('bid-123');

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.detail('bid-123') });
    });

    it('useRejectBid invalidates queries', async () => {
      vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useRejectBid(), { wrapper });
      await result.current.mutateAsync({ id: 'bid-123', data: { reason: 'No' } });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.detail('bid-123') });
    });

    it('useCounterBid invalidates queries', async () => {
      vi.spyOn(api, 'post').mockResolvedValue(mockBidDetail);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCounterBid(), { wrapper });
      await result.current.mutateAsync({
        id: 'bid-123',
        data: { amountCents: 8000, deliveryDays: 4, message: 'New terms' },
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.detail('bid-123') });
    });

    it('useAcceptCounter and useAcceptBid invalidate queries', async () => {
      const mockRes = {
        bid: mockBid,
        agreement: {
          id: 'agr-3',
          listingId: 'listing-1',
          bidId: 'bid-123',
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
      vi.spyOn(api, 'post').mockResolvedValue(mockRes);
      const { wrapper, queryClient } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result: acceptCounterHook } = renderHook(() => useAcceptCounter(), { wrapper });
      await acceptCounterHook.current.mutateAsync('bid-123');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.detail('bid-123') });

      const { result: acceptBidHook } = renderHook(() => useAcceptBid(), { wrapper });
      await acceptBidHook.current.mutateAsync('bid-123');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.bids.detail('bid-123') });
    });
  });
});
