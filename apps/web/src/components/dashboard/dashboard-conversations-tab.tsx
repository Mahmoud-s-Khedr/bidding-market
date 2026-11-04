import * as React from 'react';
import Link from 'next/link';
import { MessageSquare, ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { formatRelativeTime } from '@/lib/format';
import { safeMediaUrl } from '@/lib/safe-url';
import { useInfiniteConversations } from '@/lib/api/conversations';
import { useAuth } from '@/components/auth/auth-provider';
import type { Conversation } from '@/lib/api/messaging-types';

export function DashboardConversationsTab() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteConversations(15);

  const conversations: Conversation[] = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="conversations-skeleton">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-8 w-20" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load conversations"
        message="Could not load your recent messages. Please try again."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No messages yet"
        description="You do not have any ongoing conversations. Inquire on a listing or accept an offer to start chatting."
        action={
          <Button asChild size="sm">
            <Link href="/listings">Browse listings</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Recent Conversations ({conversations.length})
        </h2>
        <Button asChild size="sm" variant="outline">
          <Link href="/messages">
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Open Messages
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        {conversations.map((item) => {
          const counterpart =
            item.otherParticipant ??
            item.participants.find((p) => p.id !== user?.id) ??
            item.participants[0];

          const initials = (counterpart?.displayName ?? 'U')
            .split(' ')
            .map((p) => p[0])
            .join('')
            .toUpperCase()
            .substring(0, 2);

          return (
            <Card
              key={item.id}
              className="p-4 hover:border-border/80 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="flex items-start gap-3.5 min-w-0 flex-1">
                <Avatar className="h-10 w-10 shrink-0">
                  {counterpart?.avatarUrl && (
                    <AvatarImage
                      src={safeMediaUrl(counterpart.avatarUrl)}
                      alt={counterpart.displayName}
                    />
                  )}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-foreground text-sm truncate">
                      {counterpart?.displayName ?? 'User'}
                    </span>
                    {item.lastMessage && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatRelativeTime(item.lastMessage.createdAt)}
                      </span>
                    )}
                  </div>

                  {item.listing?.title && (
                    <p className="text-xs text-primary truncate mb-1">
                      Listing: {item.listing.title}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground truncate">
                    {item.lastMessage?.body ||
                      (item.lastMessage?.type === 'IMAGE'
                        ? 'Sent an image'
                        : item.lastMessage?.type === 'FILE'
                          ? 'Sent an attachment'
                          : item.lastMessage?.type === 'VOICE'
                            ? 'Voice message'
                            : 'No messages yet')}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center justify-between sm:justify-end gap-3">
                {Boolean(item.unreadCount && item.unreadCount > 0) && (
                  <Badge variant="default" className="text-xs">
                    {item.unreadCount} unread
                  </Badge>
                )}
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/messages/${item.id}`}>
                    Chat <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void fetchNextPage();
            }}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Loading more...
              </>
            ) : (
              'Load more chats'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
