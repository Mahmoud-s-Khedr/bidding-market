import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ChatView } from './chat-view';
import * as conversationsApi from '@/lib/api/conversations';
import * as realtimeModule from '@/lib/realtime';
import * as authContext from '@/components/auth/auth-provider';
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

  const realtimeHandlers: Record<string, ((data: unknown) => void)[]> = {};

  beforeEach(() => {
    vi.clearAllMocks();

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

  it('joins conversation on mount and leaves on unmount', () => {
    const { unmount } = render(<ChatView conversationId="c1" />);
    expect(mockRealtime.joinConversation).toHaveBeenCalledWith('c1');

    unmount();
    expect(mockRealtime.leaveConversation).toHaveBeenCalledWith('c1');
  });

  it('renders participant info, listing link, and marks read', () => {
    render(<ChatView conversationId="c1" />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Listing: Logo Design')).toBeInTheDocument();
    expect(screen.getByText('First message')).toBeInTheDocument();

    expect(conversationsApi.markConversationRead).toHaveBeenCalledWith('c1', 'm1');
  });

  it('sends message with optimistic update and reconciles with server response', async () => {
    const serverMessage = makeMessage({
      id: 'm-server-123',
      conversationId: 'c1',
      sender: currentUser,
      body: 'Hello Alice!',
    });

    vi.mocked(conversationsApi.sendMessage).mockResolvedValue(serverMessage);

    render(<ChatView conversationId="c1" />);

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

  it('shows error state with retry on send failure', async () => {
    vi.mocked(conversationsApi.sendMessage).mockRejectedValueOnce(new Error('Network error'));

    render(<ChatView conversationId="c1" />);

    const input = screen.getByPlaceholderText(/type a message/i);
    fireEvent.change(input, { target: { value: 'Will fail' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
      await Promise.resolve();
    });

    expect(await screen.findByText(/failed to send/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/failed to send/i)).not.toBeInTheDocument();
  });

  it('shows typing indicator when typing event is received', async () => {
    render(<ChatView conversationId="c1" />);

    act(() => {
      const handlers = realtimeHandlers['typing'] || [];
      for (const h of handlers) {
        h({ conversationId: 'c1', userId: otherUser.id, isTyping: true });
      }
    });

    expect(await screen.findByText(/alice is typing/i)).toBeInTheDocument();
  });
});
