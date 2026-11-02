import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type {
  CreateListingRequest,
  ListingDetail,
  ListingFilters,
  ListingSummary,
  PaginatedResponse,
  UpdateListingRequest,
} from './types';

export async function getListings(
  filters?: ListingFilters,
): Promise<PaginatedResponse<ListingSummary>> {
  return api.get<PaginatedResponse<ListingSummary>>('/listings', {
    params: filters as Record<string, string | number | boolean | undefined | null>,
  });
}

export async function getListing(id: string): Promise<ListingDetail> {
  return api.get<ListingDetail>(`/listings/${id}`);
}

export async function createListing(data: CreateListingRequest): Promise<ListingDetail> {
  return api.post<ListingDetail>('/listings', data);
}

export async function updateListing(
  id: string,
  data: UpdateListingRequest,
): Promise<ListingDetail> {
  return api.patch<ListingDetail>(`/listings/${id}`, data);
}

export async function closeListing(id: string): Promise<ListingDetail> {
  return api.post<ListingDetail>(`/listings/${id}/close`);
}

export async function deleteListing(id: string): Promise<void> {
  return api.delete<void>(`/listings/${id}`);
}

export function useListings(filters?: ListingFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.listings.infinite(filters),
    queryFn: ({ pageParam }) => getListings({ ...filters, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useListing(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.listings.detail(id),
    queryFn: () => getListing(id),
    enabled: options?.enabled ?? Boolean(id),
  });
}

export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createListing,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useUpdateListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateListingRequest }) =>
      updateListing(id, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.detail(variables.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useCloseListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => closeListing(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useDeleteListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteListing(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}
