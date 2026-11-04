'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuth } from '@/components/auth/auth-provider';
import { queryKeys } from './query-keys';
import type {
  AdminListingActionInput,
  AdminListingItem,
  AdminListingsQueryInput,
  AdminReportItem,
  AdminReportsQueryInput,
  AdminResolveReportInput,
  AdminStats,
  AdminUserItem,
  AdminUserUpdateInput,
  AdminUsersQueryInput,
  AuditLogItem,
  PaginatedResponse,
  ReportInput,
  ReportResponse,
} from './admin-types';

export type {
  AdminListingActionInput,
  AdminListingItem,
  AdminListingsQueryInput,
  AdminReportItem,
  AdminReportsQueryInput,
  AdminResolveReportInput,
  AdminStats,
  AdminUserItem,
  AdminUserUpdateInput,
  AdminUsersQueryInput,
  AuditLogItem,
  PaginatedResponse,
  ReportInput,
  ReportResponse,
} from './admin-types';
import type { CategoryCreateInput, CategoryUpdateInput } from '@market/shared';
import type { Category } from './types';

// ==========================================
// Viewer-scoped Query Keys
// ==========================================

export const adminQueryKeys = {
  all: (viewerId?: string | null) => ['admin', viewerId ?? 'anon'] as const,
  stats: (viewerId?: string | null) => ['admin', viewerId ?? 'anon', 'stats'] as const,
  users: (viewerId?: string | null, params?: AdminUsersQueryInput) =>
    ['admin', viewerId ?? 'anon', 'users', params] as const,
  listings: (viewerId?: string | null, params?: AdminListingsQueryInput) =>
    ['admin', viewerId ?? 'anon', 'listings', params] as const,
  reports: (viewerId?: string | null, params?: AdminReportsQueryInput) =>
    ['admin', viewerId ?? 'anon', 'reports', params] as const,
  auditLog: (viewerId?: string | null, params?: Record<string, unknown>) =>
    ['admin', viewerId ?? 'anon', 'audit-log', params] as const,
};

// ==========================================
// Invalidation Helpers
// ==========================================

export function invalidateAdminStats(queryClient: QueryClient, viewerId?: string | null) {
  return queryClient.invalidateQueries({ queryKey: adminQueryKeys.stats(viewerId) });
}

export function invalidateAdminUsers(queryClient: QueryClient, viewerId?: string | null) {
  return queryClient.invalidateQueries({ queryKey: ['admin', viewerId ?? 'anon', 'users'] });
}

export function invalidateAdminListings(queryClient: QueryClient, viewerId?: string | null) {
  return queryClient.invalidateQueries({ queryKey: ['admin', viewerId ?? 'anon', 'listings'] });
}

export function invalidateAdminReports(queryClient: QueryClient, viewerId?: string | null) {
  return queryClient.invalidateQueries({ queryKey: ['admin', viewerId ?? 'anon', 'reports'] });
}

export function invalidateAdminAuditLog(queryClient: QueryClient, viewerId?: string | null) {
  return queryClient.invalidateQueries({ queryKey: ['admin', viewerId ?? 'anon', 'audit-log'] });
}

export function invalidateCategories(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
}

// ==========================================
// Direct API Functions
// ==========================================

export async function fetchAdminStats(): Promise<AdminStats> {
  return api.get<AdminStats>('/admin/stats');
}

export async function fetchAdminUsers(
  params?: AdminUsersQueryInput,
): Promise<PaginatedResponse<AdminUserItem>> {
  const sp = new URLSearchParams();
  if (params?.cursor) sp.set('cursor', params.cursor);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.q) sp.set('q', params.q);
  if (params?.role) sp.set('role', params.role);
  if (params?.status) sp.set('status', params.status);

  const qs = sp.toString();
  return api.get<PaginatedResponse<AdminUserItem>>(`/admin/users${qs ? `?${qs}` : ''}`);
}

export async function updateAdminUser(
  id: string,
  input: AdminUserUpdateInput,
): Promise<AdminUserItem> {
  return api.patch<AdminUserItem>(`/admin/users/${encodeURIComponent(id)}`, input);
}

export async function fetchAdminListings(
  params?: AdminListingsQueryInput,
): Promise<PaginatedResponse<AdminListingItem>> {
  const sp = new URLSearchParams();
  if (params?.cursor) sp.set('cursor', params.cursor);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.q) sp.set('q', params.q);
  if (params?.status) sp.set('status', params.status);

  const qs = sp.toString();
  return api.get<PaginatedResponse<AdminListingItem>>(`/admin/listings${qs ? `?${qs}` : ''}`);
}

export async function removeAdminListing(
  id: string,
  input: AdminListingActionInput,
): Promise<AdminListingItem> {
  return api.post<AdminListingItem>(`/admin/listings/${encodeURIComponent(id)}/remove`, input);
}

export async function restoreAdminListing(
  id: string,
  input: AdminListingActionInput,
): Promise<AdminListingItem> {
  return api.post<AdminListingItem>(`/admin/listings/${encodeURIComponent(id)}/restore`, input);
}

export async function fetchAdminReports(
  params?: AdminReportsQueryInput,
): Promise<PaginatedResponse<AdminReportItem>> {
  const sp = new URLSearchParams();
  if (params?.cursor) sp.set('cursor', params.cursor);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.status) sp.set('status', params.status);

  const qs = sp.toString();
  return api.get<PaginatedResponse<AdminReportItem>>(`/admin/reports${qs ? `?${qs}` : ''}`);
}

export async function resolveAdminReport(
  id: string,
  input: AdminResolveReportInput,
): Promise<{ id: string; status: string; resolution: string }> {
  return api.post<{ id: string; status: string; resolution: string }>(
    `/admin/reports/${encodeURIComponent(id)}/resolve`,
    input,
  );
}

export async function fetchAdminAuditLog(params?: {
  cursor?: string;
  limit?: number;
  actorId?: string;
  action?: string;
  targetType?: string;
}): Promise<PaginatedResponse<AuditLogItem>> {
  const sp = new URLSearchParams();
  if (params?.cursor) sp.set('cursor', params.cursor);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.actorId) sp.set('actorId', params.actorId);
  if (params?.action) sp.set('action', params.action);
  if (params?.targetType) sp.set('targetType', params.targetType);

  const qs = sp.toString();
  return api.get<PaginatedResponse<AuditLogItem>>(`/admin/audit-log${qs ? `?${qs}` : ''}`);
}

export async function createAdminCategory(input: CategoryCreateInput): Promise<Category> {
  return api.post<Category>('/admin/categories', input);
}

export async function updateAdminCategory(
  id: string,
  input: CategoryUpdateInput,
): Promise<Category> {
  return api.patch<Category>(`/admin/categories/${encodeURIComponent(id)}`, input);
}

export async function deleteAdminCategory(id: string): Promise<void> {
  return api.delete<void>(`/admin/categories/${encodeURIComponent(id)}`);
}

export async function submitReport(input: ReportInput): Promise<ReportResponse> {
  return api.post<ReportResponse>('/reports', input);
}

export const adminApi = {
  fetchStats: fetchAdminStats,
  fetchUsers: fetchAdminUsers,
  updateUser: updateAdminUser,
  fetchListings: fetchAdminListings,
  removeListing: removeAdminListing,
  restoreListing: restoreAdminListing,
  fetchReports: fetchAdminReports,
  resolveReport: resolveAdminReport,
  fetchAuditLog: fetchAdminAuditLog,
  createCategory: createAdminCategory,
  updateCategory: updateAdminCategory,
  deleteCategory: deleteAdminCategory,
  submitReport,
};

// ==========================================
// React Query Hooks
// ==========================================

export function useAdminStats(options?: { enabled?: boolean }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: adminQueryKeys.stats(user?.id),
    queryFn: () => adminApi.fetchStats(),
    enabled: options?.enabled ?? Boolean(user && user.role === 'ADMIN'),
    staleTime: 30_000,
  });
}

export function useAdminUsers(params?: AdminUsersQueryInput, options?: { enabled?: boolean }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: adminQueryKeys.users(user?.id, params),
    queryFn: () => adminApi.fetchUsers(params),
    enabled: options?.enabled ?? Boolean(user && user.role === 'ADMIN'),
  });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminUserUpdateInput }) =>
      adminApi.updateUser(id, input),
    onSuccess: () => {
      void invalidateAdminUsers(queryClient, user?.id);
      void invalidateAdminStats(queryClient, user?.id);
      void invalidateAdminAuditLog(queryClient, user?.id);
    },
  });
}

export function useAdminListings(
  params?: AdminListingsQueryInput,
  options?: { enabled?: boolean },
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: adminQueryKeys.listings(user?.id, params),
    queryFn: () => adminApi.fetchListings(params),
    enabled: options?.enabled ?? Boolean(user && user.role === 'ADMIN'),
  });
}

export function useRemoveAdminListing() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.removeListing(id, { reason }),
    onSuccess: () => {
      void invalidateAdminListings(queryClient, user?.id);
      void invalidateAdminStats(queryClient, user?.id);
      void invalidateAdminAuditLog(queryClient, user?.id);
      void invalidateCategories(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useRestoreAdminListing() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      adminApi.restoreListing(id, { reason }),
    onSuccess: () => {
      void invalidateAdminListings(queryClient, user?.id);
      void invalidateAdminStats(queryClient, user?.id);
      void invalidateAdminAuditLog(queryClient, user?.id);
      void invalidateCategories(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useAdminReports(params?: AdminReportsQueryInput, options?: { enabled?: boolean }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: adminQueryKeys.reports(user?.id, params),
    queryFn: () => adminApi.fetchReports(params),
    enabled: options?.enabled ?? Boolean(user && user.role === 'ADMIN'),
  });
}

export function useResolveAdminReport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdminResolveReportInput }) =>
      adminApi.resolveReport(id, input),
    onSuccess: () => {
      void invalidateAdminReports(queryClient, user?.id);
      void invalidateAdminStats(queryClient, user?.id);
      void invalidateAdminAuditLog(queryClient, user?.id);
      void invalidateAdminUsers(queryClient, user?.id);
      void invalidateAdminListings(queryClient, user?.id);
      void invalidateCategories(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
    },
  });
}

export function useAdminAuditLog(
  params?: {
    cursor?: string;
    limit?: number;
    actorId?: string;
    action?: string;
    targetType?: string;
  },
  options?: { enabled?: boolean },
) {
  const { user } = useAuth();
  return useQuery({
    queryKey: adminQueryKeys.auditLog(user?.id, params),
    queryFn: () => adminApi.fetchAuditLog(params),
    enabled: options?.enabled ?? Boolean(user && user.role === 'ADMIN'),
  });
}

export function useCreateAdminCategory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (input: CategoryCreateInput) => adminApi.createCategory(input),
    onSuccess: () => {
      void invalidateCategories(queryClient);
      void invalidateAdminAuditLog(queryClient, user?.id);
    },
  });
}

export function useUpdateAdminCategory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryUpdateInput }) =>
      adminApi.updateCategory(id, input),
    onSuccess: () => {
      void invalidateCategories(queryClient);
      void invalidateAdminAuditLog(queryClient, user?.id);
    },
  });
}

export function useDeleteAdminCategory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (id: string) => adminApi.deleteCategory(id),
    onSuccess: () => {
      void invalidateCategories(queryClient);
      void invalidateAdminAuditLog(queryClient, user?.id);
    },
  });
}

export function useSubmitReport() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (input: ReportInput) => adminApi.submitReport(input),
    onSuccess: () => {
      if (user?.role === 'ADMIN') {
        void invalidateAdminReports(queryClient, user.id);
        void invalidateAdminStats(queryClient, user.id);
      }
    },
  });
}
