import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type { PaginatedResponse, PublicUser, ReviewItem } from './types';

export async function getPublicUser(id: string): Promise<PublicUser> {
  return api.get<PublicUser>(`/users/${id}`);
}

export async function getUserReviews(
  id: string,
  cursor?: string,
): Promise<PaginatedResponse<ReviewItem>> {
  return api.get<PaginatedResponse<ReviewItem>>(`/users/${id}/reviews`, {
    params: { cursor },
  });
}

export function usePublicUser(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => getPublicUser(id),
    enabled: options?.enabled ?? Boolean(id),
  });
}

export function useUserReviews(id: string, options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: queryKeys.users.reviewsInfinite(id),
    queryFn: ({ pageParam }) => getUserReviews(id, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? Boolean(id),
  });
}
