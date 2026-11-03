import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatView } from './chat-view';
import * as conversationsApi from '@/lib/api/conversations';
import * as realtimeModule from '@/lib/realtime';
import * as authContext from '@/components/auth/auth-provider';
import { queryKeys } from '@/lib/api/query-keys';
import type { Message } from '@/lib/api/messaging-types';
import { makeConversation, makeMessage, makePublicUser, makeUser } from '../../../test/fixtures';

vi.mock('@/lib/api/conversations', () => ({
  useConversation: vi.fn(),
  useInfiniteMessages: vi.fn(),
  sendMessage: vi.fn(),
  markConversationRead: vi.fn(),
}));

vi.mock('@/lib/realtime', () => ({
  useRealtime: vi.fn(),
  useRealtimeEvent: vi.fn(),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}));

describe('ChatView', () => {
  let queryClient: QueryClient;
  const currentUser = makeUser({ id: 'user-me', displayName: 'Me' });
  const otherUser = makePublicUser({ id: 'user-other', displayName: 'Alice' });

  const mockRealtime = {
    socket: null,
    isConnected: true,
    joinConversation: vi.fn().mockResolvedValue({ ok: true }),
    leaveConversation: vi.fn().mockResolvedValue({ ok: true }),
    sendTyping: vi.fn(),
    sendRead: vi.fn(),
  };

  let realtimeHandlers: Record<string, ((data: unknown) => void)[]> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient();
    realtimeHandlers = {};

    // Default document.hasFocus to true
    if (typeof document !== 'undefined') {
      document.hasFocus = vi.fn().mockReturnValue(true);
    }

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: currentUser,
      isAuthenticated: true,
      token: 'token',
      isLoading: false,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.mocked(realtimeModule.useRealtime).mockReturnValue(mockRealtime);

    vi.mocked(realtimeModule.useRealtimeEvent).mockImplementation((event, handler) => {
      if (!realtimeHandlers[event]) realtimeHandlers[event] = [];
      realtimeHandlers[event].push(handler);
    });

    vi.mocked(conversationsApi.useConversation).mockReturnValue({
      data: makeConversation({
        id: 'c1',
        otherParticipant: otherUser,
        listing: { id: 'l1', title: 'Logo Design', status: 'OPEN' },
      }),
      isLoading: false,
    } as unknown as ReturnType<typeof conversationsApi.useConversation>);

    vi.mocked(conversationsApi.useInfiniteMessages).mockReturnValue({
      data: {
        pages: [
          {
            items: [makeMessage({ id: 'm1', sender: otherUser, body: 'First message' })],
            nextCursor: null,
          },
        ],
        pageParams: [undefined],
      },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof conversationsApi.useInfiniteMessages>);

    vi.mocked(conversationsApi.markConversationRead).mockResolvedValue({ ok: true });
  });

  function renderChatView(props: { conversationId?: string; onBack?: () => void } = {}) {
    return render(
      <QueryClientProvider client={queryClient}>
        <ChatView conversationId={props.conversationId ?? 'c1'} onBack={props.onBack} />
      </QueryClientProvider>,
    );
  }

  it('joins conversation on mount and leaves on unmount', () => {
    const { unmount } = renderChatView();
    expect(mockRealtime.joinConversation).toHaveBeenCalledWith('c1');

    unmount();
    expect(mockRealtime.leaveConversation).toHaveBeenCalledWith('c1');
  });

  it('renders participant info, listing link, and marks read', () => {
    renderChatView();

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Listing: Logo Design')).toBeInTheDocument();
    expect(screen.getByText('First message')).toBeInTheDocument();

    expect(conversationsApi.markConversationRead).toHaveBeenCalledWith('c1', 'm1');
    expect(mockRealtime.sendRead).toHaveBeenCalledWith('c1', 'm1');
  });

  it('shows "unknown" presence initially, and updates to "Online" on presence event', async () => {
    renderChatView();

    // Initially status must be "unknown"
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();

    // Trigger presence event
    act(() => {
      const handlers = realtimeHandlers['presence'] || [];
      for (const h of handlers) {
        h({ userId: otherUser.id, online: true });
      }
    });

    expect(await screen.findByText('Online')).toBeInTheDocument();
  });

  it('does NOT mark conversation as read when document is not focused', () => {
    document.hasFocus = vi.fn().mockReturnValue(false);

    renderChatView();

    expect(conversationsApi.markConversationRead).not.toHaveBeenCalled();

    // When window receives focus, it marks as read
    document.hasFocus = vi.fn().mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(conversationsApi.markConversationRead).toHaveBeenCalledWith('c1', 'm1');
  });

  it('resets unreadCount to 0 in conversation list cache and invalidates unreadTotal upon mark-read', async () => {
    const cachedConv = makeConversation({ id: 'c1', unreadCount: 4 });
    queryClient.setQueryData(queryKeys.conversations.infinite(), {
      pages: [{ items: [cachedConv], nextCursor: null }],
      pageParams: [undefined],
    });

    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderChatView();

    await act(async () => {
      await Promise.resolve();
    });

    const updated = queryClient.getQueryData<{
      pages: { items: (typeof cachedConv)[] }[];
    }>(queryKeys.conversations.infinite());

    expect(updated?.pages[0]?.items[0]?.unreadCount).toBe(0);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.conversations.unreadTotal(),
    });
  });

  it('sends message with optimistic update and reconciles with server response', async () => {
    const serverMessage = makeMessage({
      id: 'm-server-123',
      conversationId: 'c1',
      sender: currentUser,
      body: 'Hello Alice!',
    });

    vi.mocked(conversationsApi.sendMessage).mockResolvedValue(serverMessage);

    renderChatView();

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Hello Alice!' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
      await Promise.resolve();
    });

    expect(conversationsApi.sendMessage).toHaveBeenCalledWith('c1', {
      type: 'TEXT',
      body: 'Hello Alice!',
      attachmentIds: [],
      voiceDurationSec: undefined,
    });

    expect(await screen.findByText('Hello Alice!')).toBeInTheDocument();
  });

  it('avoids duplicate bubbles when server echo arrives via message:new before sendMessage resolves', async () => {
    let resolveSendMessage!: (msg: Message) => void;
    vi.mocked(conversationsApi.sendMessage).mockReturnValue(
      new Promise<Message>((resolve) => {
        resolveSendMessage = resolve;
      }),
    );

    // Initial messages empty
    vi.mocked(conversationsApi.useInfiniteMessages).mockReturnValue({
      data: {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [undefined],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof conversationsApi.useInfiniteMessages>);

    renderChatView();

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Quick echo test' } });

    // Send message (optimistic bubble created)
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
      await Promise.resolve();
    });

    const messageLog = screen.getByRole('log', { name: /messages list/i });
    expect(within(messageLog).getAllByText('Quick echo test')).toHaveLength(1);

    // Server echo arrives via realtime socket BEFORE REST response resolves
    const serverEcho = makeMessage({
      id: 'm-server-echo-99',
      conversationId: 'c1',
      sender: currentUser,
      type: 'TEXT',
      body: 'Quick echo test',
    });

    vi.mocked(conversationsApi.useInfiniteMessages).mockReturnValue({
      data: {
        pages: [{ items: [serverEcho], nextCursor: null }],
        pageParams: [undefined],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof conversationsApi.useInfiniteMessages>);

    act(() => {
      const handlers = realtimeHandlers['message:new'] || [];
      for (const h of handlers) {
        h(serverEcho);
      }
    });

    // Should NOT duplicate bubbles (only 1 rendered in message log)
    expect(within(messageLog).getAllByText('Quick echo test')).toHaveLength(1);

    // REST response resolves afterwards
    await act(async () => {
      resolveSendMessage(serverEcho);
      await Promise.resolve();
    });

    expect(within(messageLog).getAllByText('Quick echo test')).toHaveLength(1);
  });

  it('shows error state with retry on send failure', async () => {
    vi.mocked(conversationsApi.sendMessage).mockRejectedValueOnce(new Error('Network error'));

    renderChatView();

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Will fail' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
      await Promise.resolve();
    });

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    // Now let retry succeed
    const successMsg = makeMessage({ id: 'm-retried', body: 'Will fail' });
    vi.mocked(conversationsApi.sendMessage).mockResolvedValueOnce(successMsg);

    await act(async () => {
      fireEvent.click(retryBtn);
      await Promise.resolve();
    });

    expect(conversationsApi.sendMessage).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
  });

  it('shows typing indicator when typing event is received', async () => {
    renderChatView();

    act(() => {
      const handlers = realtimeHandlers['typing'] || [];
      for (const h of handlers) {
        h({ conversationId: 'c1', userId: otherUser.id, isTyping: true });
      }
    });

    expect(await screen.findByText(/alice is typing/i)).toBeInTheDocument();
  });

  it('sets aria-relevant="additions" and aria-busy on the messages log container', () => {
    vi.mocked(conversationsApi.useInfiniteMessages).mockReturnValue({
      data: {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [undefined],
      },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof conversationsApi.useInfiniteMessages>);

    renderChatView();

    const log = screen.getByRole('log', { name: /messages list/i });
    expect(log).toHaveAttribute('aria-relevant', 'additions');
    expect(log).toHaveAttribute('aria-busy', 'true');
  });
});
