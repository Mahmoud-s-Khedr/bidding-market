import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { RealtimeProvider, useRealtime } from './realtime-provider';
import * as authContext from '@/components/auth/auth-provider';
import * as apiClient from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import {
  makeConversation,
  makeMessage,
  makeNotification,
  makePublicUser,
  makeUser,
} from '../../../test/fixtures';

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  getAccessToken: vi.fn(),
  executeRefresh: vi.fn(),
}));

class MockSocket {
  handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  auth: { token?: string } = {};
  connected = false;

  constructor(auth: { token?: string }) {
    this.auth = auth;
  }

  on(event: string, fn: (...args: unknown[]) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(fn);
    return this;
  }

  off(event: string, fn: (...args: unknown[]) => void) {
    if (this.handlers[event]) {
      this.handlers[event] = this.handlers[event].filter((h) => h !== fn);
    }
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    // Ack callbacks if any
    const lastArg = args[args.length - 1];
    if (typeof lastArg === 'function') {
      (lastArg as (res: unknown) => void)({ ok: true });
    }
    return this;
  }

  connect() {
    this.connected = true;
    this.trigger('connect');
    return this;
  }

  disconnect() {
    this.connected = false;
    this.trigger('disconnect');
    return this;
  }

  trigger(event: string, ...args: unknown[]) {
    const fns = this.handlers[event] || [];
    for (const fn of fns) {
      fn(...args);
    }
  }
}

function Consumer() {
  const { isConnected } = useRealtime();
  return <div>{isConnected ? 'Connected' : 'Disconnected'}</div>;
}

describe('RealtimeProvider', () => {
  let mockSocket: MockSocket;
  let queryClient: QueryClient;
  const user = makeUser({ id: 'user-me' });

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient();

    mockSocket = new MockSocket({ token: 'test-token' });
    vi.mocked(io).mockReturnValue(mockSocket as unknown as Socket);

    vi.mocked(apiClient.getAccessToken).mockReturnValue('test-token');

    vi.mocked(authContext.useAuth).mockReturnValue({
      user,
      token: 'test-token',
      isAuthenticated: true,
      isLoading: false,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('connects with token when authenticated', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Consumer />
        </RealtimeProvider>
      </QueryClientProvider>,
    );

    expect(io).toHaveBeenCalledWith(
      expect.stringContaining('/rt'),
      expect.objectContaining({
        auth: { token: 'test-token' },
      }),
    );

    act(() => {
      mockSocket.connect();
    });

    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('disconnects socket on logout', () => {
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Consumer />
        </RealtimeProvider>
      </QueryClientProvider>,
    );

    const disconnectSpy = vi.spyOn(mockSocket, 'disconnect');

    // Simulate logout
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    rerender(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Consumer />
        </RealtimeProvider>
      </QueryClientProvider>,
    );

    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('refreshes token on auth connect_error and reconnects', async () => {
    vi.mocked(apiClient.executeRefresh).mockResolvedValue({
      accessToken: 'refreshed-token',
      user: makeUser({
        id: 'user-me',
        email: 'test@example.com',
        displayName: 'Me',
      }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Consumer />
        </RealtimeProvider>
      </QueryClientProvider>,
    );

    const connectSpy = vi.spyOn(mockSocket, 'connect');

    await act(async () => {
      mockSocket.trigger('connect_error', new Error('Unauthorized'));
      await Promise.resolve();
    });

    expect(apiClient.executeRefresh).toHaveBeenCalled();
    expect(mockSocket.auth.token).toBe('refreshed-token');
    expect(connectSpy).toHaveBeenCalled();
  });

  it('updates messages cache and reorders conversation list on message:new', () => {
    const initialMessage = makeMessage({ id: 'm1', conversationId: 'c1', body: 'Old' });
    const initialConv = makeConversation({
      id: 'c1',
      lastMessage: initialMessage,
      unreadCount: 0,
    });

    queryClient.setQueryData(queryKeys.conversations.messages('c1'), {
      pages: [{ items: [initialMessage], nextCursor: null }],
      pageParams: [undefined],
    });

    queryClient.setQueryData(queryKeys.conversations.infinite(), {
      pages: [{ items: [initialConv], nextCursor: null }],
      pageParams: [undefined],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Consumer />
        </RealtimeProvider>
      </QueryClientProvider>,
    );

    const newIncomingMessage = makeMessage({
      id: 'm2',
      conversationId: 'c1',
      sender: makePublicUser({ id: 'other-sender' }),
      body: 'New message from other',
    });

    act(() => {
      mockSocket.trigger('message:new', newIncomingMessage);
    });

    // Check messages cache
    const updatedMessages = queryClient.getQueryData<{
      pages: { items: (typeof newIncomingMessage)[] }[];
    }>(queryKeys.conversations.messages('c1'));
    expect(updatedMessages?.pages[0]?.items[0]?.id).toBe('m2');

    // Check conversation list cache
    const updatedConversations = queryClient.getQueryData<{
      pages: { items: (typeof initialConv)[] }[];
    }>(queryKeys.conversations.infinite());
    expect(updatedConversations?.pages[0]?.items[0]?.lastMessage?.body).toBe(
      'New message from other',
    );
    expect(updatedConversations?.pages[0]?.items[0]?.unreadCount).toBe(1);
  });

  it('bumps unread count and prepends to notifications on notification:new', () => {
    queryClient.setQueryData(queryKeys.notifications.unreadCount(), { count: 2 });
    queryClient.setQueryData(queryKeys.notifications.all, {
      pages: [{ items: [], nextCursor: null }],
      pageParams: [undefined],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Consumer />
        </RealtimeProvider>
      </QueryClientProvider>,
    );

    const notif = makeNotification({ id: 'notif-99', title: 'New Bid' });

    act(() => {
      mockSocket.trigger('notification:new', notif);
    });

    const unread = queryClient.getQueryData<{ count: number }>(
      queryKeys.notifications.unreadCount(),
    );
    expect(unread?.count).toBe(3);

    const list = queryClient.getQueryData<{ pages: { items: (typeof notif)[] }[] }>(
      queryKeys.notifications.all,
    );
    expect(list?.pages[0]?.items[0]?.id).toBe('notif-99');
  });

  it('exposes joinConversation, leaveConversation, sendTyping, and sendRead', async () => {
    let capturedContext: ReturnType<typeof useRealtime> | null = null;
    function Helper() {
      capturedContext = useRealtime();
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          <Helper />
        </RealtimeProvider>
      </QueryClientProvider>,
    );

    const emitSpy = vi.spyOn(mockSocket, 'emit');

    await capturedContext!.joinConversation('c-test');
    expect(emitSpy).toHaveBeenCalledWith(
      'conversation:join',
      { conversationId: 'c-test' },
      expect.any(Function),
    );

    await capturedContext!.leaveConversation('c-test');
    expect(emitSpy).toHaveBeenCalledWith(
      'conversation:leave',
      { conversationId: 'c-test' },
      expect.any(Function),
    );

    capturedContext!.sendTyping('c-test', true);
    expect(emitSpy).toHaveBeenCalledWith('typing', { conversationId: 'c-test', isTyping: true });

    capturedContext!.sendRead('c-test', 'm-read-1');
    expect(emitSpy).toHaveBeenCalledWith('message:read', {
      conversationId: 'c-test',
      lastMessageId: 'm-read-1',
    });
  });
});
