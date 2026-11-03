import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { api } from './client';
import { queryKeys } from './query-keys';
import {
  closeListing,
  createListing,
  deleteListing,
  getListing,
  getListings,
  updateListing,
  useCloseListing,
  useCreateListing,
  useDeleteListing,
  useListing,
  useListings,
  useUpdateListing,
} from './listings';
import { getCategories, useCategories } from './categories';
import { completeUpload, getAttachmentUrl, presignUpload, useAttachmentUrl } from './uploads';
import { getPublicUser, getUserReviews, usePublicUser, useUserReviews } from './users';

import type { CreateListingRequest } from './types';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('Centralized Query Keys', () => {
  it('generates consistent keys for listings, categories, users, and uploads', () => {
    expect(queryKeys.listings.all).toEqual(['listings']);
    expect(queryKeys.listings.lists()).toEqual(['listings', 'list']);
    expect(queryKeys.listings.list({ q: 'test' })).toEqual(['listings', 'list', { q: 'test' }]);
    expect(queryKeys.listings.infinite({ q: 'test' })).toEqual([
      'listings',
      'infinite',
      { q: 'test' },
    ]);
    expect(queryKeys.listings.details()).toEqual(['listings', 'detail']);
    expect(queryKeys.listings.detail('id-1')).toEqual(['listings', 'detail', 'id-1', 'anon']);
    expect(queryKeys.listings.detail('id-1', 'user-123')).toEqual([
      'listings',
      'detail',
      'id-1',
      'user-123',
    ]);

    expect(queryKeys.categories.all).toEqual(['categories']);
    expect(queryKeys.categories.list()).toEqual(['categories', 'list']);

    expect(queryKeys.users.all).toEqual(['users']);
    expect(queryKeys.users.detail('u-1')).toEqual(['users', 'detail', 'u-1']);
    expect(queryKeys.users.reviews('u-1')).toEqual(['users', 'reviews', 'u-1']);
    expect(queryKeys.users.reviewsInfinite('u-1')).toEqual(['users', 'reviews', 'infinite', 'u-1']);

    expect(queryKeys.uploads.all).toEqual(['uploads']);
    expect(queryKeys.uploads.url('up-1')).toEqual(['uploads', 'url', 'up-1']);
  });
});

describe('Listings API & Hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getListings calls api.get with params', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ items: [], nextCursor: null });
    await getListings({ q: 'web', kind: 'REQUEST' });
    expect(api.get).toHaveBeenCalledWith('/listings', {
      params: { q: 'web', kind: 'REQUEST' },
    });
  });

  it('getListing, createListing, updateListing, closeListing, deleteListing execute correctly', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ id: 'l-1' });
    vi.spyOn(api, 'post').mockResolvedValue({ id: 'l-1' });
    vi.spyOn(api, 'patch').mockResolvedValue({ id: 'l-1' });
    vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    await getListing('l-1');
    expect(api.get).toHaveBeenCalledWith('/listings/l-1');

    const mockPayload: CreateListingRequest = {
      title: 'New',
      kind: 'REQUEST',
      description: 'Test description text here',
      categoryId: 'cat-1',
      priceType: 'FIXED',
      priceMinCents: 5000,
      currency: 'USD',
    };

    await createListing(mockPayload);
    expect(api.post).toHaveBeenCalledWith('/listings', mockPayload);

    await updateListing('l-1', { title: 'Updated' });
    expect(api.patch).toHaveBeenCalledWith('/listings/l-1', { title: 'Updated' });

    await closeListing('l-1');
    expect(api.post).toHaveBeenCalledWith('/listings/l-1/close');

    await deleteListing('l-1');
    expect(api.delete).toHaveBeenCalledWith('/listings/l-1');
  });

  it('useListings infinite query hook fetches pages', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ items: [{ id: 'l-1' }], nextCursor: 'cur-2' });

    const { result } = renderHook(() => useListings({ q: 'react' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.pages[0]?.items).toEqual([{ id: 'l-1' }]);
  });

  it('filter change resets the infinite query to fetch new initial page (Non-blocking item)', async () => {
    const getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ items: [{ id: 'l-filter1' }], nextCursor: 'cur-2' })
      .mockResolvedValueOnce({ items: [{ id: 'l-filter2' }], nextCursor: null });

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ filters }: { filters: { q?: string } }) => useListings(filters),
      {
        wrapper,
        initialProps: { filters: { q: 'first' } },
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data?.pages[0]?.items).toEqual([{ id: 'l-filter1' }]);

    // Changing filter param resets infinite query to initial page with new queryKey
    rerender({ filters: { q: 'second' } });

    await waitFor(() => {
      expect(result.current.data?.pages[0]?.items).toEqual([{ id: 'l-filter2' }]);
    });
    expect(getSpy).toHaveBeenCalledWith('/listings', {
      params: { q: 'second', cursor: undefined },
    });
  });

  it('useListing query hook fetches detail', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ id: 'l-1', title: 'Listing One' });

    const { result } = renderHook(() => useListing('l-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.title).toBe('Listing One');
  });

  it('useCreateListing, useUpdateListing, useCloseListing, useDeleteListing mutations work', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ id: 'l-1' });
    vi.spyOn(api, 'patch').mockResolvedValue({ id: 'l-1' });
    vi.spyOn(api, 'delete').mockResolvedValue(undefined);

    const wrapper = createWrapper();

    const { result: createHook } = renderHook(() => useCreateListing(), { wrapper });
    await createHook.current.mutateAsync({
      title: 'New',
      kind: 'REQUEST',
      description: 'Test description text here',
      categoryId: 'cat-1',
      priceType: 'FIXED',
      priceMinCents: 5000,
      currency: 'USD',
    });

    const { result: updateHook } = renderHook(() => useUpdateListing(), { wrapper });
    await updateHook.current.mutateAsync({ id: 'l-1', data: { title: 'Updated' } });

    const { result: closeHook } = renderHook(() => useCloseListing(), { wrapper });
    await closeHook.current.mutateAsync('l-1');

    const { result: deleteHook } = renderHook(() => useDeleteListing(), { wrapper });
    await deleteHook.current.mutateAsync('l-1');
  });
});

describe('Categories API & Hooks', () => {
  it('getCategories and useCategories hook fetch categories', async () => {
    vi.spyOn(api, 'get').mockResolvedValue([{ id: 'c-1', name: 'Design' }]);

    const categories = await getCategories();
    expect(categories).toEqual([{ id: 'c-1', name: 'Design' }]);

    const { result } = renderHook(() => useCategories(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual([{ id: 'c-1', name: 'Design' }]);
  });
});

describe('Uploads API & Hooks', () => {
  it('presignUpload, completeUpload, getAttachmentUrl, useAttachmentUrl execute correctly', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ uploadId: 'u-1', url: 'https://s3.example' });
    vi.spyOn(api, 'get').mockResolvedValue({ url: 'https://cdn.example' });

    await presignUpload({
      purpose: 'LISTING_IMAGE',
      fileName: 'pic.png',
      mimeType: 'image/png',
      sizeBytes: 100,
    });
    expect(api.post).toHaveBeenCalledWith('/uploads/presign', expect.any(Object));

    await completeUpload('u-1');
    expect(api.post).toHaveBeenCalledWith('/uploads/u-1/complete');

    await getAttachmentUrl('att-1');
    expect(api.get).toHaveBeenCalledWith('/uploads/att-1/url');

    const { result } = renderHook(() => useAttachmentUrl('att-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual({ url: 'https://cdn.example' });
  });
});

describe('Users API & Hooks', () => {
  it('getPublicUser, getUserReviews, usePublicUser, useUserReviews execute correctly', async () => {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url.includes('/reviews')) {
        return Promise.resolve({ items: [{ id: 'rev-1', rating: 5 }], nextCursor: null });
      }
      return Promise.resolve({ id: 'u-1', displayName: 'Elena' });
    });

    const user = await getPublicUser('u-1');
    expect(user.displayName).toBe('Elena');

    const reviews = await getUserReviews('u-1');
    expect(reviews.items.length).toBe(1);

    const wrapper = createWrapper();

    const { result: userHook } = renderHook(() => usePublicUser('u-1'), { wrapper });
    await waitFor(() => expect(userHook.current.isSuccess).toBe(true));

    const { result: reviewsHook } = renderHook(() => useUserReviews('u-1'), { wrapper });
    await waitFor(() => expect(reviewsHook.current.isSuccess).toBe(true));
  });
});
