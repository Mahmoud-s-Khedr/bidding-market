import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NotificationsBell } from './notifications-bell';
import * as notificationsApi from '@/lib/api/notifications';
import { queryKeys } from '@/lib/api/query-keys';
import type { PaginatedResponse } from '@/lib/api/types';
import type { Notification } from '@/lib/api/messaging-types';
import { makeNotification } from '../../../test/fixtures';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/lib/api/notifications', async () => {
  const actual = await vi.importActual<typeof notificationsApi>('@/lib/api/notifications');
  return {
    ...actual,
    useUnreadNotificationCount: vi.fn(),
    useNotifications: vi.fn(),
    useMarkNotificationRead: vi.fn(),
    useMarkAllNotificationsRead: vi.fn(),
  };
});

describe('NotificationsBell', () => {
  const markReadMutate = vi.fn();
  const markAllReadMutate = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.mocked(notificationsApi.useUnreadNotificationCount).mockReturnValue({
      data: { count: 3 },
    } as unknown as ReturnType<typeof notificationsApi.useUnreadNotificationCount>);

    vi.mocked(notificationsApi.useNotifications).mockReturnValue({
      data: {
        items: [
          makeNotification({
            id: 'n1',
            title: 'New Bid Received',
            body: 'Alice placed a bid of $100',
            link: '/listings/l1',
            readAt: null,
          }),
        ],
        nextCursor: null,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof notificationsApi.useNotifications>);

    vi.mocked(notificationsApi.useMarkNotificationRead).mockReturnValue({
      mutate: markReadMutate,
    } as unknown as ReturnType<typeof notificationsApi.useMarkNotificationRead>);

    vi.mocked(notificationsApi.useMarkAllNotificationsRead).mockReturnValue({
      mutate: markAllReadMutate,
      isPending: false,
    } as unknown as ReturnType<typeof notificationsApi.useMarkAllNotificationsRead>);
  });

  it('renders unread badge count', () => {
    render(<NotificationsBell />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens dropdown, displays notifications, and allows mark read and navigation', async () => {
    const user = userEvent.setup();
    render(<NotificationsBell />);

    // Open dropdown
    const bellBtn = screen.getByRole('button', { name: /notifications \(3 unread\)/i });
    await user.click(bellBtn);

    expect(screen.getByText('New Bid Received')).toBeInTheDocument();
    expect(screen.getByText('Alice placed a bid of $100')).toBeInTheDocument();

    // Click notification
    await user.click(screen.getByText('New Bid Received'));

    expect(markReadMutate).toHaveBeenCalledWith('n1');
    expect(mockPush).toHaveBeenCalledWith('/listings/l1');
  });

  it('calls markAllRead when mark all read button is clicked', async () => {
    const user = userEvent.setup();
    render(<NotificationsBell />);

    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    await user.click(bellBtn);

    const markAllBtn = screen.getByRole('button', { name: /mark all read/i });
    await user.click(markAllBtn);

    expect(markAllReadMutate).toHaveBeenCalled();
  });

  it('updates bell dropdown list live when notification:new updates query cache', async () => {
    const user = userEvent.setup();
    const actual = await vi.importActual<typeof notificationsApi>('@/lib/api/notifications');
    vi.mocked(notificationsApi.useNotifications).mockImplementation(actual.useNotifications);
    vi.mocked(notificationsApi.useUnreadNotificationCount).mockImplementation(
      actual.useUnreadNotificationCount,
    );

    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.notifications.unreadCount(), { count: 1 });
    queryClient.setQueryData(queryKeys.notifications.list(), {
      items: [makeNotification({ id: 'initial-notif', title: 'Initial Notification' })],
      nextCursor: null,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NotificationsBell />
      </QueryClientProvider>,
    );

    // Open dropdown to see initial
    const bellBtn = screen.getByRole('button', { name: /notifications/i });
    await user.click(bellBtn);
    expect(screen.getByText('Initial Notification')).toBeInTheDocument();

    // Now update cache as RealtimeProvider does on notification:new
    queryClient.setQueriesData<PaginatedResponse<Notification>>(
      { queryKey: queryKeys.notifications.all },
      (old) => {
        if (!old || !('items' in old)) return old;
        return {
          ...old,
          items: [
            makeNotification({ id: 'live-notif', title: 'Live Incoming Notification' }),
            ...old.items,
          ],
        };
      },
    );

    // The new notification appears in the bell list live
    expect(await screen.findByText('Live Incoming Notification')).toBeInTheDocument();
  });
});
