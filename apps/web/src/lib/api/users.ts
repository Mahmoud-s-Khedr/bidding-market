import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type { PaginatedResponse, PublicUser, ReviewItem, UpdateProfileInput } from './types';

export async function getPublicUser(id: string): Promise<PublicUser> {
  return api.get<PublicUser>(`/users/${id}`);
}

export async function updateProfile(data: UpdateProfileInput): Promise<PublicUser> {
  return api.patch<PublicUser>('/users/me', data);
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

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProfileInput) => updateProfile(data),
    onSuccess: (updatedUser) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(updatedUser.id) });
      void queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
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
