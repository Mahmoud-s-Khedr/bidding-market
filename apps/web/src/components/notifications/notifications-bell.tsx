'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from '@/components/ui/spinner';
import { formatRelativeTime } from '@/lib/format';
import {
  getNotificationLink,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from '@/lib/api/notifications';
import type { Notification } from '@/lib/api/messaging-types';

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const { data: countData } = useUnreadNotificationCount();
  const unreadCount = countData?.count ?? 0;

  const { data: notificationsData, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = React.useMemo(() => {
    return (notificationsData?.items ?? []).slice(0, 5);
  }, [notificationsData]);

  const handleNotificationClick = (item: Notification) => {
    if (!item.readAt) {
      markRead.mutate(item.id);
    }
    setOpen(false);
    const link = getNotificationLink(item);
    if (link) {
      router.push(link);
    }
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    markAllRead.mutate();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          className="relative rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-primary opacity-75" />
              <Badge
                variant="default"
                className="relative inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-bold leading-none bg-primary text-primary-foreground"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>

          {unreadCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              disabled={markAllRead.isPending}
              className="text-xs h-7 px-2 text-primary hover:text-primary"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all read
            </Button>
          )}
        </div>

        {/* Recent items list */}
        <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
          {isLoading ? (
            <div className="flex justify-center p-6">
              <Spinner size="sm" label="Loading notifications..." />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </div>
          ) : (
            notifications.map((item) => {
              const isUnread = !item.readAt;
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${
                    isUnread ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between w-full gap-2">
                    <span
                      className={`text-xs truncate ${
                        isUnread
                          ? 'font-semibold text-foreground'
                          : 'font-medium text-foreground/90'
                      }`}
                    >
                      {item.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.body}
                  </p>
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />

        {/* Footer */}
        <div className="p-2 text-center bg-muted/20">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-xs font-medium text-primary hover:underline p-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs"
          >
            View all notifications
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
