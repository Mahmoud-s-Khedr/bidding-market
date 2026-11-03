'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  CheckCheck,
  Download,
  FileText,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/auth-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/format';
import { getAttachmentUrl } from '@/lib/api/uploads';
import { safeMediaUrl } from '@/lib/safe-url';
import {
  markConversationRead,
  sendMessage,
  useConversation,
  useInfiniteMessages,
} from '@/lib/api/conversations';
import { queryKeys } from '@/lib/api/query-keys';
import type { Attachment, PaginatedResponse } from '@/lib/api/types';
import type { Conversation, Message, MessageType } from '@/lib/api/messaging-types';
import { useRealtime, useRealtimeEvent } from '@/lib/realtime';
import { Composer } from './composer';
import { ImageAttachmentThumbnail, Lightbox } from './lightbox';
import { AudioPlayer } from './audio-player';
import { LinkifiedText } from './linkified-text';
import {
  computeChatScrollAction,
  detectMessageListChange,
  isScrolledNearBottom,
} from './chat-scroll';
import { isMatchingOptimistic, type OptimisticMessage } from './optimistic-message';

export interface ChatViewProps {
  conversationId: string;
  onBack?: () => void;
  className?: string;
}

function getInitials(name?: string): string {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

function formatMessageTime(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function getDaySeparator(d: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return formatDate(d);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatView({ conversationId, onBack, className = '' }: ChatViewProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { joinConversation, leaveConversation, sendTyping, sendRead } = useRealtime();

  const { data: conversationData, isLoading: isLoadingConv } = useConversation(conversationId);
  const {
    data: messagesPages,
    isLoading: isLoadingMessages,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteMessages(conversationId);

  const [optimisticMessages, setOptimisticMessages] = React.useState<OptimisticMessage[]>([]);
  const [selectedLightboxImage, setSelectedLightboxImage] = React.useState<string | null>(null);
  const [isOtherTyping, setIsOtherTyping] = React.useState(false);
  const [otherUserOnline, setOtherUserOnline] = React.useState<boolean | null>(null);
  const [lastSeenMessageId, setLastSeenMessageId] = React.useState<string | null>(null);

  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const prevScrollHeightRef = React.useRef<number>(0);
  const prevMessageIdsRef = React.useRef<string[]>([]);
  const isNearBottomRef = React.useRef(true);
  const lastMarkedReadRef = React.useRef<string | null>(null);
  const typingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Extract other participant
  const otherParticipant = React.useMemo(() => {
    if (!conversationData) return null;
    if (conversationData.otherParticipant) return conversationData.otherParticipant;
    return conversationData.participants.find((p) => p.id !== user?.id) ?? null;
  }, [conversationData, user?.id]);

  // Reset presence to unknown whenever participant changes
  React.useEffect(() => {
    setOtherUserOnline(null);
  }, [otherParticipant?.id]);

  // Join on mount, leave on unmount
  React.useEffect(() => {
    if (conversationId) {
      void joinConversation(conversationId);
    }
    return () => {
      if (conversationId) {
        void leaveConversation(conversationId);
      }
    };
  }, [conversationId, joinConversation, leaveConversation]);

  // Realtime typing events
  useRealtimeEvent('typing', (data) => {
    if (data.conversationId === conversationId && data.userId !== user?.id) {
      setIsOtherTyping(data.isTyping);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (data.isTyping) {
        typingTimeoutRef.current = setTimeout(() => {
          setIsOtherTyping(false);
        }, 4000);
      }
    }
  });

  // Realtime presence events
  useRealtimeEvent('presence', (data) => {
    if (otherParticipant && data.userId === otherParticipant.id) {
      setOtherUserOnline(data.online);
    }
  });

  // Realtime read receipts
  useRealtimeEvent('message:read', (data) => {
    if (data.conversationId === conversationId && data.userId !== user?.id) {
      setLastSeenMessageId(data.lastMessageId);
    }
  });

  // Reconcile optimistic messages if server echo arrives via realtime
  useRealtimeEvent('message:new', (msg) => {
    if (msg.conversationId === conversationId && msg.sender.id === user?.id) {
      setOptimisticMessages((prev) => prev.filter((opt) => !isMatchingOptimistic(opt, msg)));
    }
  });

  // Build full chronological list of messages
  const serverMessages = React.useMemo(() => {
    if (!messagesPages?.pages) return [];
    // Concatenate all pages (each page newest-first), then reverse to get oldest-first
    const flattened = messagesPages.pages.flatMap((page) => page.items);
    return [...flattened].reverse();
  }, [messagesPages]);

  // Combine server messages with pending optimistic messages, filtering duplicates
  const allMessages: OptimisticMessage[] = React.useMemo(() => {
    const serverIds = new Set(serverMessages.map((m) => m.id));
    const activeOptimistic = optimisticMessages.filter((opt) => {
      if (serverIds.has(opt.id)) return false;
      const matched = serverMessages.some((sm) => isMatchingOptimistic(opt, sm));
      return !matched;
    });
    return [...serverMessages, ...activeOptimistic];
  }, [serverMessages, optimisticMessages]);

  // Auto-scroll logic: prepend preserves viewport, append scrolls to bottom if near bottom
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const prevIds = prevMessageIdsRef.current;
    const nextIds = allMessages.map((m) => m.id);
    const { isInitialLoad, isPrepended, isAppended } = detectMessageListChange(prevIds, nextIds);

    const action = computeChatScrollAction({
      isInitialLoad,
      isPrepended,
      isAppended,
      isNearBottom: isNearBottomRef.current,
      prevScrollHeight: prevScrollHeightRef.current,
      currentScrollHeight: el.scrollHeight,
    });

    if (action.type === 'scroll-to-bottom') {
      el.scrollTop = el.scrollHeight;
    } else if (action.type === 'preserve-scroll') {
      el.scrollTop += action.diff;
    }

    prevMessageIdsRef.current = nextIds;
    prevScrollHeightRef.current = el.scrollHeight;
  }, [allMessages]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    isNearBottomRef.current = isScrolledNearBottom(el, 50);

    // Load older messages if near top
    if (el.scrollTop < 40 && hasNextPage && !isFetchingNextPage) {
      prevScrollHeightRef.current = el.scrollHeight;
      void fetchNextPage();
    }
  };

  // Mark conversation read on visible & focused
  const markAsRead = React.useCallback(async () => {
    if (typeof document === 'undefined') return;
    // Must be visible AND window must have focus
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;

    const newest = allMessages[allMessages.length - 1];
    if (!newest || newest.id.startsWith('temp-')) return;
    if (newest.sender.id === user?.id) return;
    if (lastMarkedReadRef.current === newest.id) return;

    lastMarkedReadRef.current = newest.id;
    sendRead(conversationId, newest.id);
    try {
      await markConversationRead(conversationId, newest.id);

      // Reset unread count to 0 for this conversation across cached lists
      queryClient.setQueriesData<{
        pages: Array<PaginatedResponse<Conversation>>;
        pageParams: unknown[];
      }>({ queryKey: queryKeys.conversations.infinite() }, (old) => {
        if (!old || !old.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.map((conv) =>
              conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv,
            ),
          })),
        };
      });

      queryClient.setQueriesData<PaginatedResponse<Conversation>>(
        { queryKey: queryKeys.conversations.lists() },
        (old) => {
          if (!old || !old.items) return old;
          return {
            ...old,
            items: old.items.map((conv) =>
              conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv,
            ),
          };
        },
      );

      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.unreadTotal() });
    } catch {
      // Ignore error
    }
  }, [allMessages, conversationId, user?.id, queryClient, sendRead]);

  React.useEffect(() => {
    void markAsRead();
    const onFocus = () => void markAsRead();
    const onVis = () => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        void markAsRead();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [markAsRead]);

  // Find the last message sent by me that was read by the other party
  const lastMyMessageReadId = React.useMemo(() => {
    if (!lastSeenMessageId) return null;
    const myMessages = allMessages.filter((m) => m.sender.id === user?.id);
    const seenIndex = myMessages.findIndex((m) => m.id === lastSeenMessageId);
    if (seenIndex !== -1) {
      const match = myMessages[seenIndex];
      return match ? match.id : null;
    }
    return lastSeenMessageId;
  }, [allMessages, lastSeenMessageId, user?.id]);

  const handleSendMessage = async (payload: {
    type: MessageType;
    body?: string;
    attachmentIds?: string[];
    voiceDurationSec?: number;
    attachments?: Attachment[];
  }) => {
    if (!user) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const optimistic: OptimisticMessage = {
      id: tempId,
      conversationId,
      sender: user,
      type: payload.type,
      body: payload.body ?? null,
      voiceDurationSec: payload.voiceDurationSec ?? null,
      attachments: payload.attachments || [],
      createdAt: new Date(),
      _status: 'pending',
      _rawInput: payload,
    };

    setOptimisticMessages((prev) => [...prev, optimistic]);

    // Force scroll to bottom on send
    isNearBottomRef.current = true;
    prevScrollHeightRef.current = 0;

    try {
      const sent = await sendMessage(conversationId, {
        type: payload.type,
        body: payload.body,
        attachmentIds: payload.attachmentIds,
        voiceDurationSec: payload.voiceDurationSec,
      });

      // Insert REST response into messages cache directly and reconcile optimistic message
      queryClient.setQueryData<{
        pages: Array<PaginatedResponse<Message>>;
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) => {
        if (!old || !old.pages || old.pages.length === 0) return old;
        const exists = old.pages.some((page) => page.items.some((m) => m.id === sent.id));
        if (exists) return old;
        const newPages = [...old.pages];
        const firstPage = newPages[0];
        if (firstPage) {
          newPages[0] = {
            ...firstPage,
            nextCursor: firstPage.nextCursor ?? null,
            items: [sent, ...firstPage.items],
          };
        }
        return { ...old, pages: newPages };
      });

      setOptimisticMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...sent, _status: undefined } : m)),
      );
    } catch (err: unknown) {
      // Check if real message already arrived via server echo
      const alreadyArrived = serverMessages.some((sm) => isMatchingOptimistic(optimistic, sm));
      if (alreadyArrived) {
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== tempId));
        return;
      }

      const msg = err instanceof Error ? err.message : 'Failed to send message';
      setOptimisticMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, _status: 'error', _error: msg } : m)),
      );
    }
  };

  const handleRetryMessage = async (msg: OptimisticMessage) => {
    if (!msg._rawInput) return;
    const raw = msg._rawInput;

    setOptimisticMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, _status: 'pending', _error: undefined } : m)),
    );

    try {
      const sent = await sendMessage(conversationId, {
        type: raw.type,
        body: raw.body,
        attachmentIds: raw.attachmentIds,
        voiceDurationSec: raw.voiceDurationSec,
      });

      queryClient.setQueryData<{
        pages: Array<PaginatedResponse<Message>>;
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(conversationId), (old) => {
        if (!old || !old.pages || old.pages.length === 0) return old;
        const exists = old.pages.some((page) => page.items.some((m) => m.id === sent.id));
        if (exists) return old;
        const newPages = [...old.pages];
        const firstPage = newPages[0];
        if (firstPage) {
          newPages[0] = {
            ...firstPage,
            nextCursor: firstPage.nextCursor ?? null,
            items: [sent, ...firstPage.items],
          };
        }
        return { ...old, pages: newPages };
      });

      setOptimisticMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...sent, _status: undefined } : m)),
      );
    } catch (err: unknown) {
      const alreadyArrived = serverMessages.some((sm) => isMatchingOptimistic(msg, sm));
      if (alreadyArrived) {
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== msg.id));
        return;
      }
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      setOptimisticMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, _status: 'error', _error: errorMsg } : m)),
      );
    }
  };

  const handleDownloadAttachment = async (att: Attachment) => {
    try {
      const res = await getAttachmentUrl(att.id);
      const safeResUrl = safeMediaUrl(res?.url);
      if (safeResUrl) {
        window.open(safeResUrl, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch {
      // Fallback to existing url
    }
    const safeAttUrl = safeMediaUrl(att.url);
    if (safeAttUrl) {
      window.open(safeAttUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (isLoadingConv || isLoadingMessages) {
    return (
      <div className={`flex flex-col h-full items-center justify-center p-8 ${className}`}>
        <Spinner size="lg" label="Loading conversation..." />
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full bg-background border border-border rounded-xl shadow-xs overflow-hidden ${className}`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-xs gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              aria-label="Back to conversations"
              className="h-8 w-8 p-0 md:hidden shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}

          <div className="relative shrink-0">
            <Avatar className="h-9 w-9">
              <AvatarImage
                src={safeMediaUrl(otherParticipant?.avatarUrl) || ''}
                alt={otherParticipant?.displayName || 'User'}
              />
              <AvatarFallback>{getInitials(otherParticipant?.displayName)}</AvatarFallback>
            </Avatar>
            <span
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                otherUserOnline === true
                  ? 'bg-emerald-500'
                  : otherUserOnline === false
                    ? 'bg-muted-foreground/40'
                    : 'bg-muted-foreground/20'
              }`}
              title={
                otherUserOnline === null ? 'Status unknown' : otherUserOnline ? 'Online' : 'Offline'
              }
              aria-label={
                otherUserOnline === null ? 'Status unknown' : otherUserOnline ? 'Online' : 'Offline'
              }
            />
          </div>

          <div className="flex flex-col min-w-0">
            <Link
              href={otherParticipant ? `/users/${otherParticipant.id}` : '#'}
              className="font-semibold text-sm text-foreground hover:underline truncate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs"
            >
              {otherParticipant?.displayName ?? 'Conversation'}
            </Link>
            <span className="text-[11px] text-muted-foreground capitalize">
              {otherUserOnline === null ? 'unknown' : otherUserOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Listing or agreement reference link */}
        {conversationData?.listing && (
          <div className="flex items-center gap-2 max-w-[200px] sm:max-w-xs shrink-0">
            <Link
              href={`/listings/${conversationData.listing.id}`}
              className="text-xs text-primary hover:underline truncate font-medium bg-primary/10 px-2 py-1 rounded-md"
              title={conversationData.listing.title}
            >
              Listing: {conversationData.listing.title}
            </Link>
          </div>
        )}
        {conversationData?.agreementId && !conversationData?.listing && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">
              Agreement #{conversationData.agreementId.slice(-6)}
            </span>
          </div>
        )}
      </div>

      {/* Messages list */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={isFetchingNextPage}
        aria-label="Messages list"
      >
        {/* Infinite loader at top */}
        {hasNextPage && (
          <div className="flex justify-center py-2">
            {isFetchingNextPage ? (
              <Spinner size="sm" label="Loading older messages..." />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void fetchNextPage();
                }}
                className="text-xs text-muted-foreground"
              >
                Load older messages
              </Button>
            )}
          </div>
        )}

        {allMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 text-muted-foreground">
            <p className="text-sm">No messages yet. Send a message to start the conversation!</p>
          </div>
        )}

        {/* Message bubbles */}
        {allMessages.map((msg, index) => {
          const isOwn = msg.sender.id === user?.id;
          const msgDate =
            typeof msg.createdAt === 'string' ? new Date(msg.createdAt) : msg.createdAt;

          // Day separator logic
          let showDaySeparator = false;
          if (index === 0) {
            showDaySeparator = true;
          } else {
            const prevMsg = allMessages[index - 1];
            if (prevMsg) {
              const prevDate =
                typeof prevMsg.createdAt === 'string'
                  ? new Date(prevMsg.createdAt)
                  : prevMsg.createdAt;
              if (msgDate.toDateString() !== prevDate.toDateString()) {
                showDaySeparator = true;
              }
            }
          }

          const isLastSeen = isOwn && msg.id === lastMyMessageReadId;

          return (
            <React.Fragment key={msg.id}>
              {showDaySeparator && (
                <div className="flex items-center justify-center my-3">
                  <span className="text-[11px] font-medium text-muted-foreground bg-muted/60 px-2.5 py-0.5 rounded-full">
                    {getDaySeparator(msgDate)}
                  </span>
                </div>
              )}

              <div
                className={`flex flex-col ${
                  isOwn ? 'items-end' : 'items-start'
                } group relative max-w-[85%] sm:max-w-[75%]`}
              >
                {/* Bubble container */}
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm shadow-xs ${
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-xs'
                      : 'bg-secondary text-secondary-foreground rounded-bl-xs'
                  } ${msg._status === 'error' ? 'border-2 border-destructive bg-destructive/10' : ''}`}
                >
                  {/* Message body text */}
                  {msg.body && (
                    <div className="whitespace-pre-wrap break-words leading-relaxed">
                      <LinkifiedText text={msg.body} />
                    </div>
                  )}

                  {/* Image attachments with lightbox */}
                  {msg.type === 'IMAGE' && msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.attachments.map((att) => (
                        <ImageAttachmentThumbnail
                          key={att.id}
                          src={safeMediaUrl(att.url) || ''}
                          uploadId={att.id}
                          alt={att.fileName}
                          onClick={(url) =>
                            setSelectedLightboxImage(safeMediaUrl(url || att.url) || null)
                          }
                        />
                      ))}
                    </div>
                  )}

                  {/* File attachments */}
                  {msg.type === 'FILE' && msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {msg.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between gap-3 p-2 rounded-md bg-background/20 border border-current/15 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{att.fileName}</p>
                              <p className="text-[10px] opacity-75">
                                {formatFileSize(att.sizeBytes)}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void handleDownloadAttachment(att);
                            }}
                            aria-label={`Download ${att.fileName}`}
                            className="h-7 px-2 hover:bg-background/30 shrink-0 text-xs"
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Voice note player */}
                  {msg.type === 'VOICE' && (
                    <div className="mt-1">
                      <AudioPlayer
                        src={safeMediaUrl(msg.attachments?.[0]?.url) || ''}
                        uploadId={msg.attachments?.[0]?.id}
                        durationSec={msg.voiceDurationSec}
                      />
                    </div>
                  )}

                  {/* Timestamp and pending indicator */}
                  <div
                    className={`flex items-center gap-1.5 mt-1 text-[10px] ${
                      isOwn ? 'text-primary-foreground/75 justify-end' : 'text-muted-foreground'
                    }`}
                  >
                    <span>{formatMessageTime(msgDate)}</span>
                    {msg._status === 'pending' && (
                      <span title="Sending...">
                        <Loader2 className="h-3 w-3 animate-spin opacity-75" />
                      </span>
                    )}
                    {isOwn && isLastSeen && (
                      <span
                        className="flex items-center gap-0.5 text-primary-foreground font-medium ml-1"
                        title="Seen"
                      >
                        <CheckCheck className="h-3.5 w-3.5 text-emerald-300" />
                        <span className="text-[9px]">Seen</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Error status with retry */}
                {msg._status === 'error' && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{msg._error || 'Failed to send'}</span>
                    <button
                      type="button"
                      onClick={() => void handleRetryMessage(msg)}
                      className="font-semibold underline hover:text-destructive/80 flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* Live typing indicator */}
        {isOtherTyping && (
          <div
            className="flex items-center gap-2 text-xs text-muted-foreground italic px-2 py-1 animate-pulse"
            aria-live="polite"
          >
            <div className="flex gap-1 items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
            </div>
            <span>{otherParticipant?.displayName ?? 'User'} is typing...</span>
          </div>
        )}
      </div>

      {/* Lightbox for image attachments */}
      <Lightbox
        src={safeMediaUrl(selectedLightboxImage) || null}
        alt="Attached image preview"
        onClose={() => setSelectedLightboxImage(null)}
      />

      {/* Composer footer */}
      <Composer
        conversationId={conversationId}
        onSendMessage={handleSendMessage}
        onTyping={(isTyping) => sendTyping(conversationId, isTyping)}
      />
    </div>
  );
}
