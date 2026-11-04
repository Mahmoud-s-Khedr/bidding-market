import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useViewerId } from '@/components/auth/auth-provider';
import { api } from './client';
import { queryKeys } from './query-keys';
import type {
  Bid,
  BidAcceptResponse,
  BidCounterInput,
  BidCreateInput,
  BidDetail,
  BidRejectInput,
  BidSort,
  BidStatus,
  BidUpdateInput,
  BidWithListing,
  PaginatedResponse,
} from './types';

// API functions

export async function getListingBids(
  listingId: string,
  options?: { sort?: BidSort; cursor?: string | null; limit?: number },
): Promise<PaginatedResponse<Bid>> {
  return api.get<PaginatedResponse<Bid>>(`/listings/${listingId}/bids`, {
    params: {
      sort: options?.sort ?? 'newest',
      cursor: options?.cursor ?? undefined,
      limit: options?.limit,
    },
  });
}

export async function getMyBids(options?: {
  status?: BidStatus;
  cursor?: string | null;
  limit?: number;
}): Promise<PaginatedResponse<BidWithListing>> {
  return api.get<PaginatedResponse<BidWithListing>>('/bids/mine', {
    params: {
      status: options?.status,
      cursor: options?.cursor ?? undefined,
      limit: options?.limit,
    },
  });
}

export async function getBid(id: string): Promise<BidDetail> {
  return api.get<BidDetail>(`/bids/${id}`);
}

export async function createBid(listingId: string, data: BidCreateInput): Promise<BidDetail> {
  return api.post<BidDetail>(`/listings/${listingId}/bids`, data);
}

export async function updateBid(id: string, data: BidUpdateInput): Promise<BidDetail> {
  return api.patch<BidDetail>(`/bids/${id}`, data);
}

export async function withdrawBid(id: string): Promise<BidDetail> {
  return api.post<BidDetail>(`/bids/${id}/withdraw`);
}

export async function shortlistBid(id: string): Promise<BidDetail> {
  return api.post<BidDetail>(`/bids/${id}/shortlist`);
}

export async function rejectBid(id: string, data?: BidRejectInput): Promise<BidDetail> {
  return api.post<BidDetail>(`/bids/${id}/reject`, data ?? {});
}

export async function counterBid(id: string, data: BidCounterInput): Promise<BidDetail> {
  return api.post<BidDetail>(`/bids/${id}/counter`, data);
}

export async function acceptCounter(id: string): Promise<BidAcceptResponse> {
  return api.post<BidAcceptResponse>(`/bids/${id}/accept-counter`);
}

export async function acceptBid(id: string): Promise<BidAcceptResponse> {
  return api.post<BidAcceptResponse>(`/bids/${id}/accept`);
}

// Cache invalidation helper

export function invalidateAfterBidMutation(
  queryClient: QueryClient,
  { bidId, listingId }: { bidId?: string | null; listingId?: string | null },
) {
  if (listingId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.listings.detailAll(listingId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.bids.listingAll(listingId),
    });
  }
  if (bidId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.bids.detailAll(bidId),
    });
  }
  void queryClient.invalidateQueries({
    queryKey: queryKeys.bids.mineAll(),
  });
}

// React Query hooks

export function useListingBids(
  listingId: string,
  sort: BidSort = 'newest',
  options?: { enabled?: boolean },
) {
  const viewerId = useViewerId();
  return useInfiniteQuery({
    queryKey: queryKeys.bids.byListing(listingId, sort, viewerId),
    queryFn: ({ pageParam }) => getListingBids(listingId, { sort, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? Boolean(listingId),
  });
}

export function useMyBids(status?: BidStatus, options?: { enabled?: boolean }) {
  const viewerId = useViewerId();
  return useInfiniteQuery({
    queryKey: queryKeys.bids.mine(status, viewerId),
    queryFn: ({ pageParam }) => getMyBids({ status, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}

export function useBid(id: string, options?: { enabled?: boolean }) {
  const viewerId = useViewerId();
  return useQuery({
    queryKey: queryKeys.bids.detail(id, viewerId),
    queryFn: () => getBid(id),
    enabled: options?.enabled ?? Boolean(id),
  });
}

export function useCreateBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, data }: { listingId: string; data: BidCreateInput }) =>
      createBid(listingId, data),
    onSuccess: (result, variables) => {
      invalidateAfterBidMutation(queryClient, {
        bidId: result?.id,
        listingId: variables.listingId,
      });
    },
  });
}

export function useUpdateBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BidUpdateInput }) => updateBid(id, data),
    onSuccess: (result, variables) => {
      invalidateAfterBidMutation(queryClient, {
        bidId: variables.id,
        listingId: result?.listingId,
      });
    },
  });
}

export function useWithdrawBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => withdrawBid(id),
    onSuccess: (result, id) => {
      invalidateAfterBidMutation(queryClient, {
        bidId: id,
        listingId: result?.listingId,
      });
    },
  });
}

export function useShortlistBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shortlistBid(id),
    onSuccess: (result, id) => {
      invalidateAfterBidMutation(queryClient, {
        bidId: id,
        listingId: result?.listingId,
      });
    },
  });
}

export function useRejectBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: BidRejectInput }) => rejectBid(id, data),
    onSuccess: (result, variables) => {
      invalidateAfterBidMutation(queryClient, {
        bidId: variables.id,
        listingId: result?.listingId,
      });
    },
  });
}

export function useCounterBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BidCounterInput }) => counterBid(id, data),
    onSuccess: (result, variables) => {
      invalidateAfterBidMutation(queryClient, {
        bidId: variables.id,
        listingId: result?.listingId,
      });
    },
  });
}

export function useAcceptCounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptCounter(id),
    onSuccess: (result, id) => {
      invalidateAfterBidMutation(queryClient, {
        bidId: id,
        listingId: result?.bid?.listingId,
      });
    },
  });
}

export function useAcceptBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptBid(id),
    onSuccess: (result, id) => {
      invalidateAfterBidMutation(queryClient, {
        bidId: id,
        listingId: result?.bid?.listingId,
      });
    },
  });
}
