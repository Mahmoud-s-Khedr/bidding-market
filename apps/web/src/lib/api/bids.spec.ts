import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from './client';
import { getMyBids, useMyBids, useInfiniteMyBids } from './bids';
import { queryKeys } from './query-keys';
import { makeBidWithListing } from '../../../test/fixtures';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('Bids API & Hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getMyBids calls GET /bids/mine with params', async () => {
    const mockPage = { items: [makeBidWithListing()], nextCursor: 'next-1' };
    vi.mocked(api.get).mockResolvedValue(mockPage);

    const result = await getMyBids({ status: 'PENDING', limit: 10 });
    expect(api.get).toHaveBeenCalledWith('/bids/mine', {
      params: { status: 'PENDING', limit: 10 },
    });
    expect(result).toEqual(mockPage);
  });

  it('useMyBids and useInfiniteMyBids query hooks fetch correctly', async () => {
    const mockPage = { items: [makeBidWithListing()], nextCursor: null };
    vi.mocked(api.get).mockResolvedValue(mockPage);

    const { result: hookRes } = renderHook(() => useMyBids({ status: 'PENDING' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(hookRes.current.isSuccess).toBe(true));
    expect(hookRes.current.data?.items).toHaveLength(1);

    const { result: infRes } = renderHook(() => useInfiniteMyBids({ status: 'PENDING' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(infRes.current.isSuccess).toBe(true));
    expect(infRes.current.data?.pages[0]?.items).toHaveLength(1);
    expect(queryKeys.bids.mine({ status: 'PENDING' }, 'u1')).toEqual([
      'bids',
      'mine',
      { status: 'PENDING' },
      'u1',
    ]);
  });
});
