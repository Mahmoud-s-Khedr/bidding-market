import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getNotificationLink,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  useInfiniteNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from './notifications';
import { api } from './client';
import { makeNotification } from '../../../test/fixtures';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
}

describe('notifications API client and hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls getNotifications with params', async () => {
    const mockRes = { items: [makeNotification()], nextCursor: null };
    vi.mocked(api.get).mockResolvedValue(mockRes);

    const res = await getNotifications({ unread: true, limit: 15 });
    expect(api.get).toHaveBeenCalledWith('/notifications', {
      params: { unread: true, limit: 15 },
    });
    expect(res).toEqual(mockRes);
  });

  it('calls getUnreadNotificationCount', async () => {
    vi.mocked(api.get).mockResolvedValue({ count: 5 });

    const res = await getUnreadNotificationCount();
    expect(api.get).toHaveBeenCalledWith('/notifications/unread-count');
    expect(res).toEqual({ count: 5 });
  });

  it('calls markNotificationRead with id', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true });

    const res = await markNotificationRead('n-123');
    expect(api.post).toHaveBeenCalledWith('/notifications/n-123/read');
    expect(res).toEqual({ ok: true });
  });

  it('calls markAllNotificationsRead', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true });

    const res = await markAllNotificationsRead();
    expect(api.post).toHaveBeenCalledWith('/notifications/read-all');
    expect(res).toEqual({ ok: true });
  });

  it('hooks fetch notifications and unread count', async () => {
    const notif = makeNotification({ id: 'n1' });
    vi.mocked(api.get)
      .mockResolvedValueOnce({ items: [notif], nextCursor: null })
      .mockResolvedValueOnce({ items: [notif], nextCursor: null })
      .mockResolvedValueOnce({ count: 7 });

    const { result: listRes } = renderHook(() => useNotifications(true), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(listRes.current.isSuccess).toBe(true));

    const { result: infRes } = renderHook(() => useInfiniteNotifications(false, 10), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(infRes.current.isSuccess).toBe(true));

    const { result: countRes } = renderHook(() => useUnreadNotificationCount(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(countRes.current.isSuccess).toBe(true));
    expect(countRes.current.data?.count).toBe(7);
  });

  it('mutations mark notification read and mark all read', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true });

    const { result: readRes } = renderHook(() => useMarkNotificationRead(), {
      wrapper: createWrapper(),
    });
    await readRes.current.mutateAsync('n1');
    expect(api.post).toHaveBeenCalledWith('/notifications/n1/read');

    const { result: allRes } = renderHook(() => useMarkAllNotificationsRead(), {
      wrapper: createWrapper(),
    });
    await allRes.current.mutateAsync();
    expect(api.post).toHaveBeenCalledWith('/notifications/read-all');
  });

  describe('getNotificationLink', () => {
    it('resolves bid notifications to /bids/:id', () => {
      expect(
        getNotificationLink(
          makeNotification({
            type: 'BID_RECEIVED',
            link: null,
            data: { bidId: 'bid-1' },
          }),
        ),
      ).toBe('/bids/bid-1');

      expect(
        getNotificationLink(
          makeNotification({
            type: 'BID_ACCEPTED',
            link: '/bids/bid-2',
            data: {},
          }),
        ),
      ).toBe('/bids/bid-2');
    });

    it('resolves agreement notifications to /agreements/:id', () => {
      expect(
        getNotificationLink(
          makeNotification({
            type: 'DELIVERABLE_SUBMITTED',
            link: null,
            data: { agreementId: 'ag-1' },
          }),
        ),
      ).toBe('/agreements/ag-1');

      expect(
        getNotificationLink(
          makeNotification({
            type: 'AGREEMENT_COMPLETED',
            link: null,
            data: { id: 'ag-2' },
          }),
        ),
      ).toBe('/agreements/ag-2');
    });

    it('resolves message notifications to /messages/:id', () => {
      expect(
        getNotificationLink(
          makeNotification({
            type: 'MESSAGE_RECEIVED',
            link: null,
            data: { conversationId: 'conv-1' },
          }),
        ),
      ).toBe('/messages/conv-1');

      expect(
        getNotificationLink(
          makeNotification({
            type: 'MESSAGE_RECEIVED',
            link: '/conversations/conv-2',
            data: null,
          }),
        ),
      ).toBe('/messages/conv-2');
    });

    it('resolves review and report notifications to sensible targets', () => {
      expect(
        getNotificationLink(
          makeNotification({
            type: 'REVIEW_RECEIVED',
            link: null,
            data: { agreementId: 'ag-99' },
          }),
        ),
      ).toBe('/agreements/ag-99');

      expect(
        getNotificationLink(
          makeNotification({
            type: 'REVIEW_RECEIVED',
            link: null,
            data: { userId: 'u-5' },
          }),
        ),
      ).toBe('/users/u-5');

      expect(
        getNotificationLink(
          makeNotification({
            type: 'REPORT_RESOLVED',
            link: null,
            data: { listingId: 'list-10' },
          }),
        ),
      ).toBe('/listings/list-10');
    });

    it('falls back to item.link or /dashboard', () => {
      expect(
        getNotificationLink(
          makeNotification({
            type: 'REPORT_RESOLVED',
            link: '/custom/path',
            data: null,
          }),
        ),
      ).toBe('/custom/path');

      expect(
        getNotificationLink(
          makeNotification({
            type: 'REPORT_RESOLVED',
            link: null,
            data: null,
          }),
        ),
      ).toBe('/dashboard');
    });
  });
});
