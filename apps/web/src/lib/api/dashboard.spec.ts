import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from './client';
import { getDashboardSummary, useDashboardSummary } from './dashboard';
import { queryKeys } from './query-keys';
import { makeDashboardSummary } from '../../../test/fixtures';

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

describe('Dashboard API & Hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getDashboardSummary calls GET /dashboard/summary', async () => {
    const mockSummary = makeDashboardSummary();
    vi.mocked(api.get).mockResolvedValue(mockSummary);

    const result = await getDashboardSummary();
    expect(api.get).toHaveBeenCalledWith('/dashboard/summary');
    expect(result).toEqual(mockSummary);
  });

  it('useDashboardSummary fetches summary with queryKeys.dashboard.summary', async () => {
    const mockSummary = makeDashboardSummary();
    vi.mocked(api.get).mockResolvedValue(mockSummary);

    const { result } = renderHook(() => useDashboardSummary({ viewerId: 'user-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockSummary);
    expect(queryKeys.dashboard.summary('user-1')).toEqual(['dashboard', 'summary', 'user-1']);
    expect(queryKeys.dashboard.summary()).toEqual(['dashboard', 'summary', 'anon']);
  });
});
