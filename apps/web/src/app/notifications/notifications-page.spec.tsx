import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationsPage from './page';
import * as notificationsApi from '@/lib/api/notifications';
import * as authContext from '@/components/auth/auth-provider';
import { makeNotification, makeUser } from '../../../test/fixtures';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => '/notifications',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/notifications', async () => {
  const actual = await vi.importActual<typeof notificationsApi>('@/lib/api/notifications');
  return {
    ...actual,
    useInfiniteNotifications: vi.fn(),
    useUnreadNotificationCount: vi.fn(),
    useMarkNotificationRead: vi.fn(),
    useMarkAllNotificationsRead: vi.fn(),
  };
});

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}));

describe('NotificationsPage', () => {
  const markReadMutate = vi.fn();
  const markAllReadMutate = vi.fn();
  const fetchNextPage = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: makeUser(),
      isAuthenticated: true,
      token: 'token',
      isLoading: false,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.mocked(notificationsApi.useUnreadNotificationCount).mockReturnValue({
      data: { count: 2 },
    } as unknown as ReturnType<typeof notificationsApi.useUnreadNotificationCount>);

    vi.mocked(notificationsApi.useInfiniteNotifications).mockReturnValue({
      data: {
        pages: [
          {
            items: [
              makeNotification({
                id: 'n1',
                title: 'Unread Alert',
                body: 'Important milestone update',
                link: '/agreements/a1',
                readAt: null,
              }),
              makeNotification({
                id: 'n2',
                title: 'Read Alert',
                body: 'Welcome to the platform',
                link: null,
                readAt: new Date('2026-10-01'),
              }),
            ],
            nextCursor: 'next-1',
          },
        ],
        pageParams: [undefined],
      },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    } as unknown as ReturnType<typeof notificationsApi.useInfiniteNotifications>);

    vi.mocked(notificationsApi.useMarkNotificationRead).mockReturnValue({
      mutate: markReadMutate,
    } as unknown as ReturnType<typeof notificationsApi.useMarkNotificationRead>);

    vi.mocked(notificationsApi.useMarkAllNotificationsRead).mockReturnValue({
      mutate: markAllReadMutate,
      isPending: false,
    } as unknown as ReturnType<typeof notificationsApi.useMarkAllNotificationsRead>);
  });

  it('renders notification list, unread badge, and load more button', () => {
    render(<NotificationsPage />);

    expect(screen.getByText('Unread Alert')).toBeInTheDocument();
    expect(screen.getByText('Read Alert')).toBeInTheDocument();
    expect(screen.getByText('2 unread')).toBeInTheDocument();

    const loadMoreBtn = screen.getByRole('button', { name: /load more notifications/i });
    expect(loadMoreBtn).toBeInTheDocument();
    fireEvent.click(loadMoreBtn);
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('switches to Unread filter tab', async () => {
    const user = userEvent.setup();
    render(<NotificationsPage />);

    const unreadTab = screen.getByRole('tab', { name: /unread/i });
    await user.click(unreadTab);

    expect(notificationsApi.useInfiniteNotifications).toHaveBeenCalledWith(true, 20);
  });

  it('marks notification read and navigates on click', () => {
    render(<NotificationsPage />);

    fireEvent.click(screen.getByText('Unread Alert'));
    expect(markReadMutate).toHaveBeenCalledWith('n1');
    expect(mockPush).toHaveBeenCalledWith('/agreements/a1');
  });

  it('allows marking all notifications as read', () => {
    render(<NotificationsPage />);

    const markAllBtn = screen.getByRole('button', { name: /mark all as read/i });
    fireEvent.click(markAllBtn);

    expect(markAllReadMutate).toHaveBeenCalled();
  });
});
