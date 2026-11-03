import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import { getDashboardSummary } from './dashboard';
import type { PaginatedResponse } from './types';
import type {
  Conversation,
  ConversationCreateInput,
  Message,
  MessageCreateInput,
  MessagesQueryInput,
} from './messaging-types';

export async function getConversations(
  params?: MessagesQueryInput,
): Promise<PaginatedResponse<Conversation>> {
  return api.get<PaginatedResponse<Conversation>>('/conversations', {
    params: params as Record<string, string | number | undefined>,
  });
}

export async function getConversation(id: string): Promise<Conversation> {
  return api.get<Conversation>(`/conversations/${id}`);
}

export async function createConversation(data: ConversationCreateInput): Promise<Conversation> {
  return api.post<Conversation>('/conversations', data);
}

export async function getMessages(
  conversationId: string,
  params?: MessagesQueryInput,
): Promise<PaginatedResponse<Message>> {
  return api.get<PaginatedResponse<Message>>(`/conversations/${conversationId}/messages`, {
    params: params as Record<string, string | number | undefined>,
  });
}

export async function sendMessage(
  conversationId: string,
  data: MessageCreateInput,
): Promise<Message> {
  return api.post<Message>(`/conversations/${conversationId}/messages`, data);
}

export async function markConversationRead(
  conversationId: string,
  lastMessageId: string,
): Promise<{ ok: boolean }> {
  return api.post<{ ok: boolean }>(`/conversations/${conversationId}/read`, { lastMessageId });
}

export function useConversations(params?: MessagesQueryInput) {
  return useQuery({
    queryKey: queryKeys.conversations.list(),
    queryFn: () => getConversations(params),
  });
}

export function useInfiniteConversations(limit = 20) {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations.infinite(),
    queryFn: ({ pageParam }) => getConversations({ cursor: pageParam, limit }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useConversation(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.conversations.detail(id),
    queryFn: () => getConversation(id),
    enabled: options?.enabled ?? Boolean(id),
  });
}

export function useInfiniteMessages(conversationId: string, limit = 30) {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations.messages(conversationId),
    queryFn: ({ pageParam }) => getMessages(conversationId, { cursor: pageParam, limit }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(conversationId),
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConversationCreateInput) => createConversation(data),
    onSuccess: (newConv) => {
      queryClient.setQueryData(queryKeys.conversations.detail(newConv.id), newConv);
      void queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
    },
  });
}

/**
 * Aggregates unread message counts across active conversations for header badges.
 * Note: /dashboard/summary is not yet available on the API on main (it will provide unreadMessages).
 * Until that endpoint is implemented, this query calculates the sum across fetched conversations
 * up to the query limit (50 conversations).
 */
export function useTotalUnreadMessages(options?: { enabled?: boolean }) {
  const { data } = useQuery({
    queryKey: queryKeys.conversations.unreadTotal(),
    queryFn: async () => {
      try {
        const summary = await getDashboardSummary();
        if (typeof summary?.unreadMessages === 'number') {
          return summary.unreadMessages;
        }
      } catch {
        // Fallback calculation: sums unread counts across up to 50 conversations if dashboard summary fails
      }
      try {
        const res = await getConversations({ limit: 50 });
        return res?.items?.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0) ?? 0;
      } catch {
        return 0;
      }
    },
    enabled: options?.enabled ?? true,
    staleTime: 1000 * 30,
  });
  return data ?? 0;
}
