import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type { Category } from './types';

export async function getCategories(): Promise<Category[]> {
  return api.get<Category[]>('/categories');
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: getCategories,
    staleTime: 1000 * 60 * 5, // categories don't change often
  });
}
