import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type { PaginatedResponse } from './types';
import type {
  AgreementCancelInput,
  AgreementDetail,
  AgreementsQueryInput,
  AgreementSummary,
  DeliverableInput,
  DeliverableResponse,
  DisputeInput,
  MilestoneCreateInput,
  MilestoneResponse,
  MilestoneUpdateInput,
  ReviewInput,
  ReviewItem,
  RevisionRequestInput,
} from '@market/shared';

export function invalidateAgreementRelatedQueries(
  queryClient: QueryClient,
  options?: { agreementId?: string; viewerId?: string | null },
) {
  const viewerId = options?.viewerId;
  void queryClient.invalidateQueries({ queryKey: queryKeys.agreements.all });
  if (options?.agreementId) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.agreements.detail(options.agreementId, viewerId),
    });
  }
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.summary(viewerId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.unreadTotal() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
}

export async function getAgreements(
  params?: Partial<AgreementsQueryInput>,
): Promise<PaginatedResponse<AgreementSummary>> {
  return api.get<PaginatedResponse<AgreementSummary>>('/agreements', {
    params: params as Record<string, string | number | undefined>,
  });
}

export async function getAgreement(id: string): Promise<AgreementDetail> {
  return api.get<AgreementDetail>(`/agreements/${id}`);
}

export async function createMilestone(
  agreementId: string,
  data: MilestoneCreateInput,
): Promise<MilestoneResponse> {
  return api.post<MilestoneResponse>(`/agreements/${agreementId}/milestones`, data);
}

export async function updateMilestone(
  agreementId: string,
  milestoneId: string,
  data: MilestoneUpdateInput,
): Promise<MilestoneResponse> {
  return api.patch<MilestoneResponse>(`/agreements/${agreementId}/milestones/${milestoneId}`, data);
}

export async function submitDeliverable(
  agreementId: string,
  data: DeliverableInput,
): Promise<DeliverableResponse> {
  return api.post<DeliverableResponse>(`/agreements/${agreementId}/deliverables`, data);
}

export async function acceptDeliverable(
  agreementId: string,
  deliverableId: string,
): Promise<DeliverableResponse> {
  return api.post<DeliverableResponse>(
    `/agreements/${agreementId}/deliverables/${deliverableId}/accept`,
  );
}

export async function requestRevision(
  agreementId: string,
  deliverableId: string,
  data: RevisionRequestInput,
): Promise<DeliverableResponse> {
  return api.post<DeliverableResponse>(
    `/agreements/${agreementId}/deliverables/${deliverableId}/request-revision`,
    data,
  );
}

export async function completeAgreement(agreementId: string): Promise<AgreementDetail> {
  return api.post<AgreementDetail>(`/agreements/${agreementId}/complete`);
}

export async function cancelAgreement(
  agreementId: string,
  data: AgreementCancelInput,
): Promise<AgreementDetail> {
  return api.post<AgreementDetail>(`/agreements/${agreementId}/cancel`, data);
}

export async function disputeAgreement(
  agreementId: string,
  data: DisputeInput,
): Promise<AgreementDetail> {
  return api.post<AgreementDetail>(`/agreements/${agreementId}/dispute`, data);
}

export async function submitReview(agreementId: string, data: ReviewInput): Promise<ReviewItem> {
  return api.post<ReviewItem>(`/agreements/${agreementId}/reviews`, data);
}

export function useAgreements(
  filters?: Partial<AgreementsQueryInput>,
  options?: { enabled?: boolean; viewerId?: string | null },
) {
  return useQuery({
    queryKey: queryKeys.agreements.list(filters, options?.viewerId),
    queryFn: () => getAgreements(filters),
    enabled: options?.enabled ?? true,
  });
}

export function useInfiniteAgreements(
  filters?: Partial<AgreementsQueryInput>,
  options?: { enabled?: boolean; viewerId?: string | null },
) {
  return useInfiniteQuery({
    queryKey: queryKeys.agreements.infinite(filters, options?.viewerId),
    queryFn: ({ pageParam }) =>
      getAgreements({
        ...filters,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}

export function useAgreement(
  id: string,
  options?: { enabled?: boolean; viewerId?: string | null },
) {
  return useQuery({
    queryKey: queryKeys.agreements.detail(id, options?.viewerId),
    queryFn: () => getAgreement(id),
    enabled: options?.enabled ?? Boolean(id),
  });
}

export function useCreateMilestone(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MilestoneCreateInput) => createMilestone(agreementId, data),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}

export function useUpdateMilestone(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ milestoneId, data }: { milestoneId: string; data: MilestoneUpdateInput }) =>
      updateMilestone(agreementId, milestoneId, data),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}

export function useSubmitDeliverable(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DeliverableInput) => submitDeliverable(agreementId, data),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}

export function useAcceptDeliverable(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deliverableId: string) => acceptDeliverable(agreementId, deliverableId),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}

export function useRequestRevision(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deliverableId, data }: { deliverableId: string; data: RevisionRequestInput }) =>
      requestRevision(agreementId, deliverableId, data),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}

export function useCompleteAgreement(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => completeAgreement(agreementId),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}

export function useCancelAgreement(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AgreementCancelInput) => cancelAgreement(agreementId, data),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}

export function useDisputeAgreement(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: DisputeInput) => disputeAgreement(agreementId, data),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}

export function useSubmitReview(agreementId: string, options?: { viewerId?: string | null }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ReviewInput) => submitReview(agreementId, data),
    onSuccess: () => {
      invalidateAgreementRelatedQueries(queryClient, { agreementId, viewerId: options?.viewerId });
    },
  });
}
