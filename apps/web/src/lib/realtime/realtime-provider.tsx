'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/components/auth/auth-provider';
import { executeRefresh, getAccessToken } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import type {
  Conversation,
  Message,
  Notification,
  WsServerPayloads,
} from '@/lib/api/messaging-types';
import type { PaginatedResponse } from '@/lib/api/types';

export function getWsBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
  return `${url.replace(/\/+$/, '')}/rt`;
}

export interface RealtimeContextValue {
  socket: Socket | null;
  isConnected: boolean;
  joinConversation: (conversationId: string) => Promise<{ ok: boolean }>;
  leaveConversation: (conversationId: string) => Promise<{ ok: boolean }>;
  sendTyping: (conversationId: string, isTyping: boolean) => void;
  sendRead: (conversationId: string, lastMessageId: string) => void;
}

const RealtimeContext = React.createContext<RealtimeContextValue | undefined>(undefined);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, token } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [isConnected, setIsConnected] = React.useState<boolean>(false);
  const socketRef = React.useRef<Socket | null>(null);
  const userRef = React.useRef(user);
  userRef.current = user;

  React.useEffect(() => {
    // Only connect when authenticated and we have a valid token
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const currentToken = token || getAccessToken();
    if (!currentToken) return;

    // Create Socket.IO client instance
    const newSocket = io(getWsBaseUrl(), {
      auth: { token: currentToken },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('connect_error', async (err: Error) => {
      setIsConnected(false);
      const isAuthError =
        err.message === 'Unauthorized' ||
        /unauthorized|invalid access token|jwt/i.test(err.message);

      if (isAuthError) {
        try {
          const refreshed = await executeRefresh();
          if (refreshed?.accessToken && socketRef.current) {
            socketRef.current.auth = { token: refreshed.accessToken };
            socketRef.current.connect();
          } else if (socketRef.current) {
            socketRef.current.disconnect();
          }
        } catch {
          if (socketRef.current) {
            socketRef.current.disconnect();
          }
        }
      }
    });

    // Wire global query updates
    newSocket.on('message:new', (rawMessage: unknown) => {
      const message = rawMessage as Message;
      const currentUser = userRef.current;

      // 1. Update the conversation messages cache
      queryClient.setQueryData<{
        pages: Array<PaginatedResponse<Message>>;
        pageParams: unknown[];
      }>(queryKeys.conversations.messages(message.conversationId), (old) => {
        if (!old || !old.pages || old.pages.length === 0) return old;
        const exists = old.pages.some((page) => page.items.some((m) => m.id === message.id));
        if (exists) return old;

        const newPages = [...old.pages];
        const firstPage = newPages[0];
        if (firstPage) {
          newPages[0] = {
            ...firstPage,
            nextCursor: firstPage.nextCursor ?? null,
            items: [message, ...firstPage.items],
          };
        }
        return {
          ...old,
          pages: newPages,
        };
      });

      // 2. Update the conversations list (last message, unread count, reorder)
      let foundInCache = false;
      queryClient.setQueriesData<{
        pages: Array<PaginatedResponse<Conversation>>;
        pageParams: unknown[];
      }>({ queryKey: queryKeys.conversations.infinite() }, (old) => {
        if (!old || !old.pages) return old;
        let targetConv: Conversation | null = null;

        const newPages = old.pages.map((page) => ({
          ...page,
          items: page.items.filter((conv) => {
            if (conv.id === message.conversationId) {
              targetConv = conv;
              foundInCache = true;
              return false;
            }
            return true;
          }),
        }));

        if (!targetConv) return old;
        const convToUpdate = targetConv as Conversation;

        const isFromMe = currentUser?.id === message.sender.id;
        const updatedConv: Conversation = {
          ...convToUpdate,
          lastMessage: message,
          unreadCount: isFromMe
            ? (convToUpdate.unreadCount ?? 0)
            : (convToUpdate.unreadCount ?? 0) + 1,
          updatedAt:
            typeof message.createdAt === 'string'
              ? message.createdAt
              : message.createdAt.toISOString(),
        };

        const firstPage = newPages[0];
        if (firstPage) {
          newPages[0] = {
            ...firstPage,
            nextCursor: firstPage.nextCursor ?? null,
            items: [updatedConv, ...firstPage.items],
          };
        }

        return {
          ...old,
          pages: newPages,
        };
      });

      if (!foundInCache) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.unreadTotal() });
    });

    newSocket.on('notification:new', (rawNotification: unknown) => {
      const notification = rawNotification as Notification;

      // 1. Bump the unread count
      queryClient.setQueryData<{ count: number }>(queryKeys.notifications.unreadCount(), (old) => ({
        count: (old?.count ?? 0) + 1,
      }));

      // 2. Prepend to the notifications list cache
      queryClient.setQueriesData<{
        pages: Array<PaginatedResponse<Notification>>;
        pageParams: unknown[];
      }>({ queryKey: queryKeys.notifications.all }, (old) => {
        if (!old || !old.pages || old.pages.length === 0) return old;
        const exists = old.pages.some((page) => page.items.some((n) => n.id === notification.id));
        if (exists) return old;

        const newPages = [...old.pages];
        const firstPage = newPages[0];
        if (firstPage) {
          newPages[0] = {
            ...firstPage,
            nextCursor: firstPage.nextCursor ?? null,
            items: [notification, ...firstPage.items],
          };
        }
        return {
          ...old,
          pages: newPages,
        };
      });
    });

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
    };
  }, [isAuthenticated, token, queryClient]);

  const joinConversation = React.useCallback((conversationId: string): Promise<{ ok: boolean }> => {
    return new Promise((resolve) => {
      if (!socketRef.current) {
        resolve({ ok: false });
        return;
      }
      socketRef.current.emit('conversation:join', { conversationId }, (ack?: { ok: boolean }) => {
        resolve(ack ?? { ok: true });
      });
    });
  }, []);

  const leaveConversation = React.useCallback(
    (conversationId: string): Promise<{ ok: boolean }> => {
      return new Promise((resolve) => {
        if (!socketRef.current) {
          resolve({ ok: false });
          return;
        }
        socketRef.current.emit(
          'conversation:leave',
          { conversationId },
          (ack?: { ok: boolean }) => {
            resolve(ack ?? { ok: true });
          },
        );
      });
    },
    [],
  );

  const sendTyping = React.useCallback((conversationId: string, isTyping: boolean) => {
    if (!socketRef.current) return;
    socketRef.current.emit('typing', { conversationId, isTyping });
  }, []);

  const sendRead = React.useCallback((conversationId: string, lastMessageId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('message:read', { conversationId, lastMessageId });
  }, []);

  const contextValue = React.useMemo<RealtimeContextValue>(
    () => ({
      socket,
      isConnected,
      joinConversation,
      leaveConversation,
      sendTyping,
      sendRead,
    }),
    [socket, isConnected, joinConversation, leaveConversation, sendTyping, sendRead],
  );

  return <RealtimeContext.Provider value={contextValue}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  const context = React.useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}

export function useRealtimeEvent<K extends keyof WsServerPayloads>(
  event: K,
  handler: (payload: WsServerPayloads[K]) => void,
): void {
  const { socket } = useRealtime();
  const handlerRef = React.useRef(handler);
  handlerRef.current = handler;

  React.useEffect(() => {
    if (!socket) return;
    const eventName: string = event;
    const listener = (...args: unknown[]) => {
      handlerRef.current(args[0] as WsServerPayloads[K]);
    };
    socket.on(eventName, listener);
    return () => {
      socket.off(eventName, listener);
    };
  }, [socket, event]);
}
