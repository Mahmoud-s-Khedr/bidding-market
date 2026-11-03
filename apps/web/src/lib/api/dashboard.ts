import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type { DashboardSummary } from '@market/shared';

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return api.get<DashboardSummary>('/dashboard/summary');
}

export function useDashboardSummary(options?: { enabled?: boolean; viewerId?: string | null }) {
  return useQuery({
    queryKey: queryKeys.dashboard.summary(options?.viewerId),
    queryFn: () => getDashboardSummary(),
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 30,
  });
}
