import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsBell } from './notifications-bell';
import * as notificationsApi from '@/lib/api/notifications';
import { makeNotification } from '../../../test/fixtures';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/lib/api/notifications', () => ({
  useUnreadNotificationCount: vi.fn(),
  useNotifications: vi.fn(),
  useMarkNotificationRead: vi.fn(),
  useMarkAllNotificationsRead: vi.fn(),
}));

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
});
