import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createConversation,
  getConversation,
  getConversations,
  getMessages,
  markConversationRead,
  sendMessage,
  useConversation,
  useConversations,
  useCreateConversation,
  useInfiniteConversations,
  useInfiniteMessages,
  useTotalUnreadMessages,
} from './conversations';
import { api } from './client';
import { makeConversation, makeMessage } from '../../../test/fixtures';

vi.mock('./client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
}

describe('conversations API client and hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls getConversations with params', async () => {
    const mockRes = { items: [makeConversation()], nextCursor: 'c-next' };
    vi.mocked(api.get).mockResolvedValue(mockRes);

    const res = await getConversations({ limit: 10, cursor: 'c-prev' });
    expect(api.get).toHaveBeenCalledWith('/conversations', {
      params: { limit: 10, cursor: 'c-prev' },
    });
    expect(res).toEqual(mockRes);
  });

  it('calls getConversation by id', async () => {
    const mockConv = makeConversation({ id: 'c123' });
    vi.mocked(api.get).mockResolvedValue(mockConv);

    const res = await getConversation('c123');
    expect(api.get).toHaveBeenCalledWith('/conversations/c123');
    expect(res).toEqual(mockConv);
  });

  it('calls createConversation with payload', async () => {
    const mockConv = makeConversation({ id: 'c-new' });
    vi.mocked(api.post).mockResolvedValue(mockConv);

    const res = await createConversation({ recipientId: 'u2', listingId: 'l1' });
    expect(api.post).toHaveBeenCalledWith('/conversations', {
      recipientId: 'u2',
      listingId: 'l1',
    });
    expect(res).toEqual(mockConv);
  });

  it('calls getMessages with conversationId and query', async () => {
    const mockMsgs = { items: [makeMessage()], nextCursor: null };
    vi.mocked(api.get).mockResolvedValue(mockMsgs);

    const res = await getMessages('c1', { limit: 20 });
    expect(api.get).toHaveBeenCalledWith('/conversations/c1/messages', {
      params: { limit: 20 },
    });
    expect(res).toEqual(mockMsgs);
  });

  it('calls sendMessage with payload', async () => {
    const mockMsg = makeMessage({ id: 'm-sent', body: 'Hi' });
    vi.mocked(api.post).mockResolvedValue(mockMsg);

    const res = await sendMessage('c1', { type: 'TEXT', body: 'Hi' });
    expect(api.post).toHaveBeenCalledWith('/conversations/c1/messages', {
      type: 'TEXT',
      body: 'Hi',
    });
    expect(res).toEqual(mockMsg);
  });

  it('calls markConversationRead with lastMessageId', async () => {
    vi.mocked(api.post).mockResolvedValue({ ok: true });

    const res = await markConversationRead('c1', 'm99');
    expect(api.post).toHaveBeenCalledWith('/conversations/c1/read', {
      lastMessageId: 'm99',
    });
    expect(res).toEqual({ ok: true });
  });

  it('hooks fetch conversations, conversation detail, and total unread count', async () => {
    const conv = makeConversation({ id: 'c1', unreadCount: 4 });
    vi.mocked(api.get).mockResolvedValue({ items: [conv], nextCursor: null });

    const { result: listRes } = renderHook(() => useConversations(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(listRes.current.isSuccess).toBe(true));
    expect(listRes.current.data?.items[0]?.id).toBe('c1');

    const { result: detailRes } = renderHook(() => useConversation('c1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(detailRes.current.isSuccess).toBe(true));

    const { result: unreadRes } = renderHook(() => useTotalUnreadMessages({ viewerId: 'user-1' }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(unreadRes.current).toBe(4));

    const { result: infiniteRes } = renderHook(() => useInfiniteConversations(10), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(infiniteRes.current.isSuccess).toBe(true));

    const { result: msgRes } = renderHook(() => useInfiniteMessages('c1', 10), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(msgRes.current.isSuccess).toBe(true));
  });

  it('useCreateConversation mutation creates a conversation', async () => {
    const newConv = makeConversation({ id: 'c-created' });
    vi.mocked(api.post).mockResolvedValue(newConv);

    const { result } = renderHook(() => useCreateConversation(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ recipientId: 'user-2' });
    expect(api.post).toHaveBeenCalledWith('/conversations', { recipientId: 'user-2' });
  });
});
