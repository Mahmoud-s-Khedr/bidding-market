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

/**
 * Validates that a link is a safe, valid in-app relative path.
 * Must start with a single '/' (not '//' or '/\'), and contain no schemes.
 */
export function isValidInAppPath(link: unknown): link is string {
  if (typeof link !== 'string') return false;
  const trimmed = link.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return false;
  }
  if (trimmed.includes('\\')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    return parsed.origin === 'http://localhost';
  } catch {
    return false;
  }
}

function normalizeInAppPath(path: string): string {
  if (path.startsWith('/conversations/')) {
    return path.replace('/conversations/', '/messages/');
  }
  return path;
}

export function getNotificationLink(item: Notification): string {
  // Prefer the server-provided item.link when it is a valid in-app path
  if (item.link && isValidInAppPath(item.link)) {
    return normalizeInAppPath(item.link);
  }

  const data = (item.data ?? {}) as Record<string, unknown>;

  let resolvedPath = '/dashboard';

  switch (item.type) {
    case 'BID_RECEIVED':
    case 'BID_UPDATED':
    case 'BID_COUNTERED':
    case 'BID_ACCEPTED':
    case 'BID_REJECTED': {
      // Route /bids/:id is introduced in PR #9 (WEB-03) and depends on its merge into main.
      // Keep /bids/:id only if data.bidId is explicitly present.
      if (typeof data.bidId === 'string' && data.bidId) {
        resolvedPath = `/bids/${data.bidId}`;
      } else if (typeof data.listingId === 'string' && data.listingId) {
        resolvedPath = `/listings/${data.listingId}`;
      } else {
        resolvedPath = '/dashboard';
      }
      break;
    }
    case 'DELIVERABLE_SUBMITTED':
    case 'DELIVERABLE_ACCEPTED':
    case 'REVISION_REQUESTED':
    case 'AGREEMENT_COMPLETED':
    case 'AGREEMENT_CANCELLED': {
      if (typeof data.agreementId === 'string' && data.agreementId) {
        resolvedPath = `/agreements/${data.agreementId}`;
      } else {
        resolvedPath = '/dashboard';
      }
      break;
    }
    case 'MESSAGE_RECEIVED': {
      if (typeof data.conversationId === 'string' && data.conversationId) {
        resolvedPath = `/messages/${data.conversationId}`;
      } else {
        resolvedPath = '/messages';
      }
      break;
    }
    case 'REVIEW_RECEIVED': {
      if (typeof data.agreementId === 'string' && data.agreementId) {
        resolvedPath = `/agreements/${data.agreementId}`;
      } else if (typeof data.targetId === 'string' && data.targetId) {
        resolvedPath = `/users/${data.targetId}`;
      } else if (typeof data.userId === 'string' && data.userId) {
        resolvedPath = `/users/${data.userId}`;
      } else {
        resolvedPath = '/dashboard';
      }
      break;
    }
    case 'REPORT_RESOLVED': {
      if (typeof data.listingId === 'string' && data.listingId) {
        resolvedPath = `/listings/${data.listingId}`;
      } else if (
        data.targetType === 'LISTING' &&
        typeof data.targetId === 'string' &&
        data.targetId
      ) {
        resolvedPath = `/listings/${data.targetId}`;
      } else {
        resolvedPath = '/dashboard';
      }
      break;
    }
    default:
      resolvedPath = '/dashboard';
      break;
  }

  return isValidInAppPath(resolvedPath) ? resolvedPath : '/dashboard';
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
