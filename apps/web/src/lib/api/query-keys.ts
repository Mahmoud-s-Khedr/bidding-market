import type { ListingFilters } from './types';

export const queryKeys = {
  listings: {
    all: ['listings'] as const,
    lists: () => ['listings', 'list'] as const,
    list: (filters?: ListingFilters, viewerId?: string | null) =>
      filters?.ownerId === 'me'
        ? (['listings', 'list', filters, viewerId ?? 'anon'] as const)
        : (['listings', 'list', filters] as const),
    infinite: (filters?: ListingFilters, viewerId?: string | null) =>
      filters?.ownerId === 'me'
        ? (['listings', 'infinite', filters, viewerId ?? 'anon'] as const)
        : (['listings', 'infinite', filters] as const),
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
  bids: {
    all: ['bids'] as const,
    byListing: (listingId: string, sort?: string, viewerId?: string | null) =>
      ['bids', 'listing', listingId, sort ?? 'newest', viewerId ?? 'anon'] as const,
    mineAll: (viewerId?: string | null) =>
      viewerId ? (['bids', 'mine', viewerId] as const) : (['bids', 'mine'] as const),
    mine: (status?: string, viewerId?: string | null) =>
      ['bids', 'mine', viewerId ?? 'anon', status ?? 'all'] as const,
    details: () => ['bids', 'detail'] as const,
    detail: (id: string, viewerId?: string | null) =>
      ['bids', 'detail', id, viewerId ?? 'anon'] as const,
  },
};
