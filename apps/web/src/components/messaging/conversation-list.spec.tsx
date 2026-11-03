import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConversationList } from './conversation-list';
import * as conversationsApi from '@/lib/api/conversations';
import * as authContext from '@/components/auth/auth-provider';
import { makeConversation, makePublicUser, makeMessage, makeUser } from '../../../test/fixtures';

vi.mock('@/lib/api/conversations', () => ({
  useInfiniteConversations: vi.fn(),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}));

describe('ConversationList', () => {
  const currentUser = makeUser({ id: 'user-me', displayName: 'Me' });

  beforeEach(() => {
    vi.restoreAllMocks();
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
  });

  it('renders conversations and unread badges properly', () => {
    const conv1 = makeConversation({
      id: 'c1',
      unreadCount: 3,
      otherParticipant: makePublicUser({ id: 'other-1', displayName: 'Alice Worker' }),
      lastMessage: makeMessage({ body: 'Are you available?' }),
      listing: { id: 'l1', title: 'Website Redesign', status: 'OPEN' },
    });

    const conv2 = makeConversation({
      id: 'c2',
      unreadCount: 0,
      otherParticipant: makePublicUser({ id: 'other-2', displayName: 'Bob Client' }),
      lastMessage: makeMessage({ type: 'VOICE', body: null }),
      listing: null,
    });

    vi.mocked(conversationsApi.useInfiniteConversations).mockReturnValue({
      data: {
        pages: [{ items: [conv1, conv2], nextCursor: null }],
        pageParams: [undefined],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof conversationsApi.useInfiniteConversations>);

    const handleSelect = vi.fn();
    render(<ConversationList activeId="c1" onSelectConversation={handleSelect} />);

    expect(screen.getByText('Alice Worker')).toBeInTheDocument();
    expect(screen.getByText('Are you available?')).toBeInTheDocument();
    expect(screen.getByText('Website Redesign')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Unread badge

    expect(screen.getByText('Bob Client')).toBeInTheDocument();
    expect(screen.getByText('🎤 Voice message')).toBeInTheDocument();

    // Clicking conversation triggers selection
    fireEvent.click(screen.getByText('Bob Client'));
    expect(handleSelect).toHaveBeenCalledWith('c2');
  });

  it('renders empty state when there are no conversations', () => {
    vi.mocked(conversationsApi.useInfiniteConversations).mockReturnValue({
      data: {
        pages: [{ items: [], nextCursor: null }],
        pageParams: [undefined],
      },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    } as unknown as ReturnType<typeof conversationsApi.useInfiniteConversations>);

    render(<ConversationList />);
    expect(screen.getByText(/no conversations yet/i)).toBeInTheDocument();
  });
});
