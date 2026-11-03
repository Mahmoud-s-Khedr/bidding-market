import type { ListingFilters } from './types';

export const queryKeys = {
  listings: {
    all: ['listings'] as const,
    lists: () => ['listings', 'list'] as const,
    list: (filters?: ListingFilters) => ['listings', 'list', filters] as const,
    infinite: (filters?: ListingFilters) => ['listings', 'infinite', filters] as const,
    details: () => ['listings', 'detail'] as const,
    detail: (id: string, viewerId?: string | null) =>
      ['listings', 'detail', id, viewerId ?? 'anon'] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: () => ['categories', 'list'] as const,
  },
  users: {
    all: ['users'] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
    reviews: (id: string) => ['users', 'reviews', id] as const,
    reviewsInfinite: (id: string) => ['users', 'reviews', 'infinite', id] as const,
  },
  uploads: {
    all: ['uploads'] as const,
    url: (id: string) => ['uploads', 'url', id] as const,
  },
  conversations: {
    all: ['conversations'] as const,
    lists: () => ['conversations', 'list'] as const,
    list: () => ['conversations', 'list'] as const,
    infinite: () => ['conversations', 'infinite'] as const,
    details: () => ['conversations', 'detail'] as const,
    detail: (id: string) => ['conversations', 'detail', id] as const,
    messages: (id: string) => ['conversations', 'messages', id] as const,
    unreadTotal: () => ['conversations', 'unread-total'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    lists: () => ['notifications', 'list'] as const,
    list: (unread?: boolean) => ['notifications', 'list', { unread }] as const,
    infinite: (unread?: boolean) => ['notifications', 'infinite', { unread }] as const,
    unreadCount: () => ['notifications', 'unread-count'] as const,
  },
};
