import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

// React Query hooks

export function useListingBids(
  listingId: string,
  sort: BidSort = 'newest',
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: queryKeys.bids.byListing(listingId, sort),
    queryFn: ({ pageParam }) => getListingBids(listingId, { sort, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? Boolean(listingId),
  });
}

export function useMyBids(status?: BidStatus, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: queryKeys.bids.mine(status),
    queryFn: ({ pageParam }) => getMyBids({ status, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}

export function useBid(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.bids.detail(id),
    queryFn: () => getBid(id),
    enabled: options?.enabled ?? Boolean(id),
  });
}

export function useCreateBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, data }: { listingId: string; data: BidCreateInput }) =>
      createBid(listingId, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.bids.byListing(variables.listingId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.mineAll() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.all });
    },
  });
}

export function useUpdateBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BidUpdateInput }) => updateBid(id, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.all });
    },
  });
}

export function useWithdrawBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => withdrawBid(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.all });
    },
  });
}

export function useShortlistBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => shortlistBid(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.all });
    },
  });
}

export function useRejectBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: BidRejectInput }) => rejectBid(id, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.all });
    },
  });
}

export function useCounterBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BidCounterInput }) => counterBid(id, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.all });
    },
  });
}

export function useAcceptCounter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptCounter(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.all });
    },
  });
}

export function useAcceptBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptBid(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bids.all });
    },
  });
}
