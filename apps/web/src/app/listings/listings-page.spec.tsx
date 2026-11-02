import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingsContent } from './page';
import * as listingsApi from '@/lib/api/listings';
import * as categoriesApi from '@/lib/api/categories';
import type { ListingSummary } from '@/lib/api/types';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/listings',
  useSearchParams: () => mockSearchParams,
}));

describe('Listings Browse Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockSearchParams = new URLSearchParams();

    vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
      data: [{ id: 'cat-1', name: 'Tech', slug: 'tech', parentId: null, children: [] }],
      isLoading: false,
    } as unknown as ReturnType<typeof categoriesApi.useCategories>);
  });

  const sampleListing: ListingSummary = {
    id: 'l-1',
    title: 'Fullstack Next.js Developer',
    kind: 'REQUEST',
    status: 'OPEN',
    priceType: 'FIXED',
    priceMinCents: 50000,
    priceMaxCents: 50000,
    currency: 'USD',
    deliveryDays: 7,
    location: 'Remote',
    tags: ['react'],
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Tech', slug: 'tech' },
    ownerId: 'u-1',
    owner: {
      id: 'u-1',
      displayName: 'Alice',
      isBusiness: false,
      ratingAvg: 5.0,
      ratingCount: 1,
      completedCount: 2,
      createdAt: '2026-01-01T00:00:00Z',
    },
    images: [],
    bidCount: 2,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  it('renders listings items returned from useListings', () => {
    vi.spyOn(listingsApi, 'useListings').mockReturnValue({
      data: {
        pages: [{ items: [sampleListing], nextCursor: null }],
        pageParams: [null],
      },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    render(<ListingsContent />);

    expect(screen.getByText('Marketplace Listings')).toBeInTheDocument();
    expect(screen.getByText('Fullstack Next.js Developer')).toBeInTheDocument();
  });

  it('updates search query in URL when search input is submitted', async () => {
    const user = userEvent.setup();

    vi.spyOn(listingsApi, 'useListings').mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    render(<ListingsContent />);

    const searchInput = screen.getByLabelText(/search listings/i);
    await user.type(searchInput, 'frontend{enter}');

    expect(mockPush).toHaveBeenCalledWith('/listings?q=frontend');
  });

  it('renders empty state when no listings match filters', () => {
    vi.spyOn(listingsApi, 'useListings').mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    render(<ListingsContent />);

    expect(screen.getByText('No listings found')).toBeInTheDocument();
  });

  it('renders error state and retries on click', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();

    vi.spyOn(listingsApi, 'useListings').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Network failure'),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch,
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    render(<ListingsContent />);

    expect(screen.getByText('Unable to load listings')).toBeInTheDocument();
    expect(screen.getByText('Network failure')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    await user.click(retryBtn);

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('triggers fetchNextPage when load more button is clicked', async () => {
    const user = userEvent.setup();
    const fetchNextPage = vi.fn();

    vi.spyOn(listingsApi, 'useListings').mockReturnValue({
      data: {
        pages: [{ items: [sampleListing], nextCursor: 'cursor-2' }],
        pageParams: [null],
      },
      isLoading: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    render(<ListingsContent />);

    const loadMoreBtn = screen.getByRole('button', { name: /load more/i });
    await user.click(loadMoreBtn);

    await waitFor(() => {
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });
  });
});
