'use client';

import * as React from 'react';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { useAuth } from '@/components/auth/auth-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { formatRelativeTime, getInitials } from '@/lib/format';
import { safeMediaUrl } from '@/lib/safe-url';
import { useInfiniteConversations } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/messaging-types';

export interface ConversationListProps {
  activeId?: string;
  onSelectConversation?: (id: string) => void;
  className?: string;
}

function getMessagePreview(conversation: Conversation): string {
  if (!conversation.lastMessage) return 'No messages yet';
  const last = conversation.lastMessage;
  if (last.type === 'VOICE') return '🎤 Voice message';
  if (last.type === 'IMAGE') return '📷 Photo';
  if (last.type === 'FILE') return '📎 Attachment';
  return last.body || 'Message';
}

export function ConversationList({
  activeId,
  onSelectConversation,
  className = '',
}: ConversationListProps) {
  const { user } = useAuth();
  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteConversations(20);

  const conversations = React.useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items);
  }, [data]);

  if (isLoading) {
    return (
      <div className={`flex flex-1 items-center justify-center p-8 ${className}`}>
        <Spinner size="md" label="Loading conversations..." />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className={`p-4 ${className}`}>
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="Messages with buyers and sellers will appear here."
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden ${className}`}>
      <div className="flex-1 overflow-y-auto divide-y divide-border/60">
        {conversations.map((conv) => {
          const other =
            conv.otherParticipant ||
            conv.participants.find((p) => p.id !== user?.id) ||
            conv.participants[0];

          const isActive = conv.id === activeId;
          const unreadCount = conv.unreadCount ?? 0;
          const preview = getMessagePreview(conv);
          const time = conv.lastMessage
            ? formatRelativeTime(conv.lastMessage.createdAt)
            : formatRelativeTime(conv.updatedAt);

          return (
            <Link
              key={conv.id}
              href={`/messages/${conv.id}`}
              onClick={(e) => {
                if (onSelectConversation) {
                  e.preventDefault();
                  onSelectConversation(conv.id);
                }
              }}
              className={`flex items-start gap-3 p-3.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive ? 'bg-secondary font-medium' : 'bg-background'
              }`}
              aria-label={`Conversation with ${other?.displayName ?? 'User'}`}
            >
              <Avatar className="h-11 w-11 shrink-0 border border-border/50">
                {other?.avatarUrl && (
                  <AvatarImage src={safeMediaUrl(other.avatarUrl)} alt={other.displayName} />
                )}
                <AvatarFallback>{getInitials(other?.displayName)}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="font-semibold text-sm text-foreground truncate">
                    {other?.displayName ?? 'User'}
                  </span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {time}
                  </span>
                </div>

                {conv.listing && (
                  <p className="text-[11px] text-primary truncate font-medium mb-0.5">
                    {conv.listing.title}
                  </p>
                )}

                <p
                  className={`text-xs truncate ${
                    unreadCount > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {preview}
                </p>
              </div>

              {unreadCount > 0 && (
                <div className="shrink-0 self-center">
                  <Badge variant="default" className="h-5 min-w-[20px] px-1.5 text-[11px]">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Badge>
                </div>
              )}
            </Link>
          );
        })}

        {hasNextPage && (
          <div className="p-3 text-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isFetchingNextPage}
              onClick={() => {
                void fetchNextPage();
              }}
              className="w-full text-xs"
            >
              {isFetchingNextPage ? 'Loading more...' : 'Load more conversations'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
