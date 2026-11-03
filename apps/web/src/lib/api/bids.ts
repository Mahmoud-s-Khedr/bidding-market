import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type { PaginatedResponse } from './types';
import type { BidWithListing, MyBidsQueryInput } from '@market/shared';

export async function getMyBids(
  params?: Partial<MyBidsQueryInput>,
): Promise<PaginatedResponse<BidWithListing>> {
  return api.get<PaginatedResponse<BidWithListing>>('/bids/mine', {
    params: params as Record<string, string | number | undefined>,
  });
}

export function useMyBids(
  filters?: Partial<MyBidsQueryInput>,
  options?: { enabled?: boolean; viewerId?: string | null },
) {
  return useQuery({
    queryKey: queryKeys.bids.mine(filters, options?.viewerId),
    queryFn: () => getMyBids(filters),
    enabled: options?.enabled ?? true,
  });
}

export function useInfiniteMyBids(
  filters?: Partial<MyBidsQueryInput>,
  options?: { enabled?: boolean; viewerId?: string | null },
) {
  return useInfiniteQuery({
    queryKey: queryKeys.bids.infiniteMine(filters, options?.viewerId),
    queryFn: ({ pageParam }) =>
      getMyBids({
        ...filters,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}
