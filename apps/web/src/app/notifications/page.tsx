'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { RequireAuth } from '@/components/auth/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatRelativeTime } from '@/lib/format';
import {
  useInfiniteNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useUnreadNotificationCount,
} from '@/lib/api/notifications';
import type { Notification } from '@/lib/api/messaging-types';

export default function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');
  const isUnreadFilter = filter === 'unread';

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteNotifications(isUnreadFilter ? true : undefined, 20);

  const { data: countData } = useUnreadNotificationCount();
  const unreadCount = countData?.count ?? 0;

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items);
  }, [data]);

  const handleNotificationClick = (item: Notification) => {
    if (!item.readAt) {
      markRead.mutate(item.id);
    }
    if (item.link) {
      router.push(item.link);
    }
  };

  return (
    <React.Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner size="lg" label="Loading notifications..." />
        </div>
      }
    >
      <RequireAuth>
        <div className="container mx-auto px-4 py-8 sm:px-6 max-w-4xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  Notifications
                </h1>
                {unreadCount > 0 && (
                  <Badge variant="default" className="text-xs">
                    {unreadCount} unread
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Stay updated with your bids, messages, deliverables, and agreement milestones.
              </p>
            </div>

            {unreadCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="shrink-0 self-start sm:self-auto"
              >
                <CheckCheck className="h-4 w-4 mr-1.5" />
                Mark all as read
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="mb-6">
            <Tabs
              value={filter}
              onValueChange={(val) => setFilter(val as 'all' | 'unread')}
              className="w-full sm:w-auto"
            >
              <TabsList>
                <TabsTrigger value="all">All Notifications</TabsTrigger>
                <TabsTrigger value="unread">
                  Unread {unreadCount > 0 && `(${unreadCount})`}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex justify-center p-12">
              <Spinner size="lg" label="Loading notifications..." />
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title={isUnreadFilter ? 'No unread notifications' : 'No notifications yet'}
              description={
                isUnreadFilter
                  ? 'You have caught up with all your updates.'
                  : 'Activity regarding your listings, bids, and messages will appear here.'
              }
            />
          ) : (
            <div className="rounded-lg border border-border bg-card shadow-xs overflow-hidden divide-y divide-border">
              {notifications.map((item) => {
                const isUnread = !item.readAt;
                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-4 transition-colors cursor-pointer flex items-start gap-4 ${
                      isUnread ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/40'
                    }`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNotificationClick(item);
                      }
                    }}
                    aria-label={`${item.title} - ${isUnread ? 'Unread' : 'Read'}`}
                  >
                    <div
                      className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${
                        isUnread ? 'bg-primary' : 'bg-transparent'
                      }`}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
                        <h3
                          className={`text-sm ${
                            isUnread
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-foreground/90'
                          }`}
                        >
                          {item.title}
                        </h3>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatRelativeTime(item.createdAt)} ({formatDate(item.createdAt)})
                        </span>
                      </div>

                      <p className="text-sm text-muted-foreground leading-relaxed break-words">
                        {item.body}
                      </p>

                      {item.link && (
                        <span className="inline-block mt-2 text-xs font-semibold text-primary hover:underline">
                          View details &rarr;
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {hasNextPage && (
                <div className="p-4 text-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isFetchingNextPage}
                    onClick={() => {
                      void fetchNextPage();
                    }}
                    className="text-xs"
                  >
                    {isFetchingNextPage ? 'Loading more...' : 'Load more notifications'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </RequireAuth>
    </React.Suspense>
  );
}
