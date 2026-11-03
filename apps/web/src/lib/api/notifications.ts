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

export function getNotificationLink(item: Notification): string {
  const data = (item.data ?? {}) as Record<string, unknown>;

  switch (item.type) {
    case 'BID_RECEIVED':
    case 'BID_UPDATED':
    case 'BID_COUNTERED':
    case 'BID_ACCEPTED':
    case 'BID_REJECTED': {
      const bidId =
        (typeof data.bidId === 'string' && data.bidId) ||
        (typeof data.id === 'string' && data.id) ||
        null;
      if (bidId) return `/bids/${bidId}`;
      if (item.link && item.link.startsWith('/bids/')) return item.link;
      if (item.link) return item.link;
      return '/dashboard';
    }
    case 'DELIVERABLE_SUBMITTED':
    case 'DELIVERABLE_ACCEPTED':
    case 'REVISION_REQUESTED':
    case 'AGREEMENT_COMPLETED':
    case 'AGREEMENT_CANCELLED': {
      const agreementId =
        (typeof data.agreementId === 'string' && data.agreementId) ||
        (typeof data.id === 'string' && data.id) ||
        null;
      if (agreementId) return `/agreements/${agreementId}`;
      if (item.link && item.link.startsWith('/agreements/')) return item.link;
      if (item.link) return item.link;
      return '/dashboard';
    }
    case 'MESSAGE_RECEIVED': {
      const convId =
        (typeof data.conversationId === 'string' && data.conversationId) ||
        (typeof data.id === 'string' && data.id) ||
        null;
      if (convId) return `/messages/${convId}`;
      if (item.link?.startsWith('/conversations/')) {
        return item.link.replace('/conversations/', '/messages/');
      }
      if (item.link?.startsWith('/messages/')) return item.link;
      if (item.link) return item.link;
      return '/messages';
    }
    case 'REVIEW_RECEIVED': {
      if (typeof data.agreementId === 'string' && data.agreementId) {
        return `/agreements/${data.agreementId}`;
      }
      if (typeof data.targetId === 'string' && data.targetId) {
        return `/users/${data.targetId}`;
      }
      if (typeof data.userId === 'string' && data.userId) {
        return `/users/${data.userId}`;
      }
      if (item.link) return item.link;
      return '/dashboard';
    }
    case 'REPORT_RESOLVED': {
      if (typeof data.listingId === 'string' && data.listingId) {
        return `/listings/${data.listingId}`;
      }
      if (data.targetType === 'LISTING' && typeof data.targetId === 'string' && data.targetId) {
        return `/listings/${data.targetId}`;
      }
      if (item.link) return item.link;
      return '/dashboard';
    }
    default:
      if (item.link) {
        if (item.link.startsWith('/conversations/')) {
          return item.link.replace('/conversations/', '/messages/');
        }
        return item.link;
      }
      return '/dashboard';
  }
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
