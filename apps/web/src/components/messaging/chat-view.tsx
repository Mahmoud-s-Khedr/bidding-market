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
import { useAuth } from '@/components/auth/auth-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/format';
import { getAttachmentUrl } from '@/lib/api/uploads';
import {
  markConversationRead,
  sendMessage,
  useConversation,
  useInfiniteMessages,
} from '@/lib/api/conversations';
import type { Attachment } from '@/lib/api/types';
import type { Message, MessageType } from '@/lib/api/messaging-types';
import { useRealtime, useRealtimeEvent } from '@/lib/realtime';
import { Composer } from './composer';
import { ImageAttachmentThumbnail, Lightbox } from './lightbox';
import { AudioPlayer } from './audio-player';
import { LinkifiedText } from './linkified-text';

export interface ChatViewProps {
  conversationId: string;
  onBack?: () => void;
  className?: string;
}

interface OptimisticMessage extends Message {
  _status?: 'pending' | 'error';
  _error?: string;
  _rawInput?: {
    type: MessageType;
    body?: string;
    attachmentIds?: string[];
    voiceDurationSec?: number;
    attachments?: Attachment[];
  };
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
  const { joinConversation, leaveConversation, sendTyping } = useRealtime();

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
  const isNearBottomRef = React.useRef(true);
  const lastMarkedReadRef = React.useRef<string | null>(null);
  const typingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Extract other participant
  const otherParticipant = React.useMemo(() => {
    if (!conversationData) return null;
    if (conversationData.otherParticipant) return conversationData.otherParticipant;
    return conversationData.participants.find((p) => p.id !== user?.id) ?? null;
  }, [conversationData, user?.id]);

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

  // Build full chronological list of messages
  const serverMessages = React.useMemo(() => {
    if (!messagesPages?.pages) return [];
    // Concatenate all pages (each page newest-first), then reverse to get oldest-first
    const flattened = messagesPages.pages.flatMap((page) => page.items);
    return [...flattened].reverse();
  }, [messagesPages]);

  // Combine server messages with pending optimistic messages
  const allMessages: OptimisticMessage[] = React.useMemo(() => {
    const serverIds = new Set(serverMessages.map((m) => m.id));
    const activeOptimistic = optimisticMessages.filter((m) => !serverIds.has(m.id));
    return [...serverMessages, ...activeOptimistic];
  }, [serverMessages, optimisticMessages]);

  // Auto-scroll logic: scroll to bottom on initial load or new incoming messages
  React.useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (prevScrollHeightRef.current > 0) {
      // If we loaded older messages (scrollHeight changed without scroll being at bottom)
      const diff = el.scrollHeight - prevScrollHeightRef.current;
      if (diff > 0 && !isNearBottomRef.current) {
        el.scrollTop += diff;
      }
    } else {
      // First load or sending
      el.scrollTop = el.scrollHeight;
    }
    prevScrollHeightRef.current = el.scrollHeight;
  }, [allMessages]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    isNearBottomRef.current = atBottom;

    // Load older messages if near top
    if (el.scrollTop < 40 && hasNextPage && !isFetchingNextPage) {
      prevScrollHeightRef.current = el.scrollHeight;
      void fetchNextPage();
    }
  };

  // Mark conversation read on visible & focused
  const markAsRead = React.useCallback(async () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;

    const newest = allMessages[allMessages.length - 1];
    if (!newest || newest.id.startsWith('temp-')) return;
    if (newest.sender.id === user?.id) return;
    if (lastMarkedReadRef.current === newest.id) return;

    lastMarkedReadRef.current = newest.id;
    try {
      await markConversationRead(conversationId, newest.id);
    } catch {
      // Ignore error
    }
  }, [allMessages, conversationId, user?.id]);

  React.useEffect(() => {
    void markAsRead();
    const onFocus = () => void markAsRead();
    const onVis = () => {
      if (document.visibilityState === 'visible') void markAsRead();
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
    // If not exact match, check if lastSeenMessageId is past this message
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

      // Reconcile optimistic message
      setOptimisticMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...sent, _status: undefined } : m)),
      );
    } catch (err: unknown) {
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

      setOptimisticMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...sent, _status: undefined } : m)),
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send message';
      setOptimisticMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, _status: 'error', _error: errorMsg } : m)),
      );
    }
  };

  const handleDownloadAttachment = async (att: Attachment) => {
    try {
      const res = await getAttachmentUrl(att.id);
      if (res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch {
      // Fallback to existing url
    }
    if (att.url) {
      window.open(att.url, '_blank', 'noopener,noreferrer');
    }
  };

  if (isLoadingConv || isLoadingMessages) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Spinner size="lg" label="Loading conversation..." />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-background overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/50 backdrop-blur-xs shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onBack}
              aria-label="Back to conversations list"
              className="h-8 w-8 p-0 md:hidden shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          <div className="relative">
            <Avatar className="h-9 w-9">
              {otherParticipant?.avatarUrl && (
                <AvatarImage src={otherParticipant.avatarUrl} alt={otherParticipant.displayName} />
              )}
              <AvatarFallback>{getInitials(otherParticipant?.displayName)}</AvatarFallback>
            </Avatar>
            <span
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background ${
                otherUserOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'
              }`}
              title={otherUserOnline ? 'Online' : 'Offline'}
              aria-label={otherUserOnline ? 'Online' : 'Offline'}
            />
          </div>

          <div className="flex flex-col min-w-0">
            <Link
              href={otherParticipant ? `/users/${otherParticipant.id}` : '#'}
              className="font-semibold text-sm text-foreground hover:underline truncate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-xs"
            >
              {otherParticipant?.displayName ?? 'Conversation'}
            </Link>
            <span className="text-[11px] text-muted-foreground">
              {otherUserOnline ? 'Online' : 'Offline'}
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
              Agreement active
            </span>
          </div>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        role="log"
        aria-live="polite"
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
                className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} group`}
                data-message-id={msg.id}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-xs text-sm ${
                    isOwn
                      ? 'bg-primary text-primary-foreground rounded-br-xs'
                      : 'bg-muted text-foreground rounded-bl-xs'
                  } ${msg._status === 'pending' ? 'opacity-70' : ''}`}
                >
                  {/* Text content with linkify */}
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
                          src={att.url || ''}
                          alt={att.fileName}
                          onClick={() => setSelectedLightboxImage(att.url || '')}
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
                        src={msg.attachments?.[0]?.url || ''}
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
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    )}
                  </div>
                </div>

                {/* Error retry button */}
                {msg._status === 'error' && (
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>Failed to send</span>
                    <button
                      type="button"
                      onClick={() => {
                        void handleRetryMessage(msg);
                      }}
                      className="underline font-semibold hover:opacity-80 flex items-center gap-1 ml-1"
                    >
                      <RefreshCw className="h-3 w-3" /> Retry
                    </button>
                  </div>
                )}

                {/* Read receipt "Seen" */}
                {isLastSeen && (
                  <div className="flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground font-medium">
                    <CheckCheck className="h-3.5 w-3.5 text-primary" />
                    <span>Seen</span>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}

        {/* Typing indicator */}
        {isOtherTyping && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse py-1">
            <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
            <span>{otherParticipant?.displayName ?? 'User'} is typing...</span>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      <Lightbox src={selectedLightboxImage} onClose={() => setSelectedLightboxImage(null)} />

      {/* Composer */}
      <Composer
        conversationId={conversationId}
        onSendMessage={handleSendMessage}
        onTyping={(isTyping) => sendTyping(conversationId, isTyping)}
      />
    </div>
  );
}
