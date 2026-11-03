import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type { PaginatedResponse } from './types';
import type { Notification, NotificationQueryInput } from './messaging-types';

export async function getNotifications(
  params?: NotificationQueryInput,
): Promise<PaginatedResponse<Notification>> {
  return api.get<PaginatedResponse<Notification>>('/notifications', {
    params: params as Record<string, string | number | boolean | undefined>,
  });
}

export async function getUnreadNotificationCount(): Promise<{ count: number }> {
  return api.get<{ count: number }>('/notifications/unread-count');
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>('/notifications/read-all');
}

export function useNotifications(unread?: boolean) {
  return useQuery({
    queryKey: queryKeys.notifications.list(unread),
    queryFn: () => getNotifications({ unread }),
  });
}

export function useInfiniteNotifications(unread?: boolean, limit = 20) {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.infinite(unread),
    queryFn: ({ pageParam }) => getNotifications({ cursor: pageParam, limit, unread }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useUnreadNotificationCount(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: () => getUnreadNotificationCount(),
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 30, // 30s
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (_, id) => {
      // Optimistically decrement count
      queryClient.setQueryData<{ count: number }>(queryKeys.notifications.unreadCount(), (old) => ({
        count: Math.max(0, (old?.count ?? 1) - 1),
      }));

      // Update notifications in cache
      queryClient.setQueriesData<{
        pages: Array<PaginatedResponse<Notification>>;
        pageParams: unknown[];
      }>({ queryKey: queryKeys.notifications.all }, (data) => {
        if (!data || !data.pages) return data;
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
            ),
          })),
        };
      });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.setQueryData<{ count: number }>(queryKeys.notifications.unreadCount(), {
        count: 0,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
