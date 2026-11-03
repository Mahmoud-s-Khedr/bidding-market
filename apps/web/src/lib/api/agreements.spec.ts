import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from './client';
import {
  getAgreements,
  getAgreement,
  createMilestone,
  updateMilestone,
  submitDeliverable,
  acceptDeliverable,
  requestRevision,
  completeAgreement,
  cancelAgreement,
  disputeAgreement,
  submitReview,
  invalidateAgreementRelatedQueries,
  useAgreements,
  useInfiniteAgreements,
  useAgreement,
  useCreateMilestone,
  useUpdateMilestone,
  useSubmitDeliverable,
  useAcceptDeliverable,
  useRequestRevision,
  useCompleteAgreement,
  useCancelAgreement,
  useDisputeAgreement,
  useSubmitReview,
} from './agreements';
import { queryKeys } from './query-keys';
import {
  makeAgreementDetail,
  makeAgreementSummary,
  makeMilestone,
  makeDeliverable,
  makeReviewItem,
} from '../../../test/fixtures';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, Wrapper };
}

describe('Agreements API & Mutation Hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('API functions', () => {
    it('getAgreements calls GET /agreements with filters', async () => {
      const mockRes = { items: [makeAgreementSummary()], nextCursor: null };
      vi.mocked(api.get).mockResolvedValue(mockRes);

      const res = await getAgreements({ status: 'ACTIVE', role: 'buyer' });
      expect(api.get).toHaveBeenCalledWith('/agreements', {
        params: { status: 'ACTIVE', role: 'buyer' },
      });
      expect(res).toEqual(mockRes);
    });

    it('getAgreement calls GET /agreements/:id', async () => {
      const mockDetail = makeAgreementDetail({ id: 'ag-1' });
      vi.mocked(api.get).mockResolvedValue(mockDetail);

      const res = await getAgreement('ag-1');
      expect(api.get).toHaveBeenCalledWith('/agreements/ag-1');
      expect(res).toEqual(mockDetail);
    });

    it('milestone API calls post and patch', async () => {
      const mockMs = makeMilestone();
      vi.mocked(api.post).mockResolvedValue(mockMs);
      vi.mocked(api.patch).mockResolvedValue(mockMs);

      await createMilestone('ag-1', { title: 'New Milestone', amountCents: 1000 });
      expect(api.post).toHaveBeenCalledWith('/agreements/ag-1/milestones', {
        title: 'New Milestone',
        amountCents: 1000,
      });

      await updateMilestone('ag-1', 'ms-1', { status: 'DONE' });
      expect(api.patch).toHaveBeenCalledWith('/agreements/ag-1/milestones/ms-1', {
        status: 'DONE',
      });
    });

    it('deliverables API calls submit, accept, and revision', async () => {
      const mockDeliv = makeDeliverable();
      vi.mocked(api.post).mockResolvedValue(mockDeliv);

      await submitDeliverable('ag-1', { note: 'Done work', attachmentIds: ['att-1'] });
      expect(api.post).toHaveBeenCalledWith('/agreements/ag-1/deliverables', {
        note: 'Done work',
        attachmentIds: ['att-1'],
      });

      await acceptDeliverable('ag-1', 'deliv-1');
      expect(api.post).toHaveBeenCalledWith('/agreements/ag-1/deliverables/deliv-1/accept');

      await requestRevision('ag-1', 'deliv-1', { note: 'Please fix typo' });
      expect(api.post).toHaveBeenCalledWith(
        '/agreements/ag-1/deliverables/deliv-1/request-revision',
        { note: 'Please fix typo' },
      );
    });

    it('agreement lifecycle calls complete, cancel, dispute, and review', async () => {
      const mockDetail = makeAgreementDetail();
      vi.mocked(api.post).mockResolvedValue(mockDetail);

      await completeAgreement('ag-1');
      expect(api.post).toHaveBeenCalledWith('/agreements/ag-1/complete');

      await cancelAgreement('ag-1', { reason: 'No longer needed' });
      expect(api.post).toHaveBeenCalledWith('/agreements/ag-1/cancel', {
        reason: 'No longer needed',
      });

      await disputeAgreement('ag-1', { reason: 'Work not as agreed' });
      expect(api.post).toHaveBeenCalledWith('/agreements/ag-1/dispute', {
        reason: 'Work not as agreed',
      });

      const mockRev = makeReviewItem();
      vi.mocked(api.post).mockResolvedValue(mockRev);
      await submitReview('ag-1', { rating: 5, comment: 'Superb' });
      expect(api.post).toHaveBeenCalledWith('/agreements/ag-1/reviews', {
        rating: 5,
        comment: 'Superb',
      });
    });
  });

  describe('Invalidation helper', () => {
    it('invalidates agreement, dashboard, and notification query keys', () => {
      const queryClient = new QueryClient();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      invalidateAgreementRelatedQueries(queryClient, { agreementId: 'ag-1', viewerId: 'user-1' });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.agreements.all });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.agreements.detail('ag-1', 'user-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.dashboard.all });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.dashboard.summary('user-1'),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.notifications.all });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.notifications.unreadCount(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.conversations.unreadTotal(),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.users.all });
    });
  });

  describe('React Query hooks', () => {
    it('useAgreements, useInfiniteAgreements, and useAgreement fetch data', async () => {
      const mockDetail = makeAgreementDetail({ id: 'ag-1' });
      const mockList = { items: [makeAgreementSummary()], nextCursor: null };
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/agreements/ag-1') return Promise.resolve(mockDetail);
        return Promise.resolve(mockList);
      });

      const { Wrapper } = createWrapper();

      const { result: detailRes } = renderHook(() => useAgreement('ag-1', { viewerId: 'user-1' }), {
        wrapper: Wrapper,
      });
      await waitFor(() => expect(detailRes.current.isSuccess).toBe(true));
      expect(detailRes.current.data?.id).toBe('ag-1');

      const { result: listRes } = renderHook(
        () => useAgreements({ status: 'ACTIVE' }, { viewerId: 'user-1' }),
        { wrapper: Wrapper },
      );
      await waitFor(() => expect(listRes.current.isSuccess).toBe(true));
      expect(listRes.current.data?.items).toHaveLength(1);

      const { result: infRes } = renderHook(
        () => useInfiniteAgreements({ status: 'ACTIVE' }, { viewerId: 'user-1' }),
        { wrapper: Wrapper },
      );
      await waitFor(() => expect(infRes.current.isSuccess).toBe(true));
      expect(infRes.current.data?.pages[0]?.items).toHaveLength(1);
    });

    it('mutation hooks execute and trigger invalidation', async () => {
      const { queryClient, Wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      vi.mocked(api.post).mockResolvedValue({ id: 'res-ok' });
      vi.mocked(api.patch).mockResolvedValue({ id: 'res-ok' });

      // useCreateMilestone
      const { result: createMsHook } = renderHook(
        () => useCreateMilestone('ag-1', { viewerId: 'u1' }),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await createMsHook.current.mutateAsync({ title: 'M1' });
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.agreements.detail('ag-1', 'u1'),
      });

      // useUpdateMilestone
      const { result: updateMsHook } = renderHook(
        () => useUpdateMilestone('ag-1', { viewerId: 'u1' }),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await updateMsHook.current.mutateAsync({ milestoneId: 'm1', data: { status: 'DONE' } });
      });

      // useSubmitDeliverable
      const { result: submitDelivHook } = renderHook(
        () => useSubmitDeliverable('ag-1', { viewerId: 'u1' }),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await submitDelivHook.current.mutateAsync({ note: 'Note', attachmentIds: ['a1'] });
      });

      // useAcceptDeliverable
      const { result: acceptDelivHook } = renderHook(
        () => useAcceptDeliverable('ag-1', { viewerId: 'u1' }),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await acceptDelivHook.current.mutateAsync('d1');
      });

      // useRequestRevision
      const { result: reqRevHook } = renderHook(
        () => useRequestRevision('ag-1', { viewerId: 'u1' }),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await reqRevHook.current.mutateAsync({ deliverableId: 'd1', data: { note: 'Revise' } });
      });

      // useCompleteAgreement
      const { result: completeHook } = renderHook(
        () => useCompleteAgreement('ag-1', { viewerId: 'u1' }),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await completeHook.current.mutateAsync();
      });

      // useCancelAgreement
      const { result: cancelHook } = renderHook(
        () => useCancelAgreement('ag-1', { viewerId: 'u1' }),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await cancelHook.current.mutateAsync({ reason: 'Cancel' });
      });

      // useDisputeAgreement
      const { result: disputeHook } = renderHook(
        () => useDisputeAgreement('ag-1', { viewerId: 'u1' }),
        { wrapper: Wrapper },
      );
      await act(async () => {
        await disputeHook.current.mutateAsync({ reason: 'Dispute' });
      });

      // useSubmitReview
      const { result: reviewHook } = renderHook(() => useSubmitReview('ag-1', { viewerId: 'u1' }), {
        wrapper: Wrapper,
      });
      await act(async () => {
        await reviewHook.current.mutateAsync({ rating: 5, comment: 'Nice' });
      });
    });
  });
});
