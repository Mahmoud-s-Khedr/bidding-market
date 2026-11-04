import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ListingSummary as SharedListingSummary } from '@market/shared';
import DashboardPage from './page';
import * as authContext from '@/components/auth/auth-provider';
import * as dashboardApi from '@/lib/api/dashboard';
import * as listingsApi from '@/lib/api/listings';
import * as bidsApi from '@/lib/api/bids';
import * as conversationsApi from '@/lib/api/conversations';
import * as agreementsApi from '@/lib/api/agreements';
import {
  makeUser,
  makeDashboardSummary,
  makeListingSummary,
  makeBidWithListing,
  makeConversation,
  makeAgreementSummary,
} from '../../../test/fixtures';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api/dashboard', () => ({
  useDashboardSummary: vi.fn(),
}));

vi.mock('@/lib/api/listings', () => ({
  useListings: vi.fn(),
}));

vi.mock('@/lib/api/bids', () => ({
  useInfiniteMyBids: vi.fn(),
}));

vi.mock('@/lib/api/conversations', () => ({
  useInfiniteConversations: vi.fn(),
}));

vi.mock('@/lib/api/agreements', () => ({
  useInfiniteAgreements: vi.fn(),
}));

describe('DashboardPage Component', () => {
  const mockRefetchSummary = vi.fn();
  const mockRefetchListings = vi.fn();
  const mockFetchNextListings = vi.fn();
  const mockRefetchBids = vi.fn();
  const mockFetchNextBids = vi.fn();
  const mockRefetchConvs = vi.fn();
  const mockFetchNextConvs = vi.fn();
  const mockRefetchAgreements = vi.fn();
  const mockFetchNextAgreements = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: makeUser({ id: 'user-1', displayName: 'Current User' }),
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.mocked(dashboardApi.useDashboardSummary).mockReturnValue({
      data: makeDashboardSummary({
        listings: { open: 2, inProgress: 1, completed: 3 },
        bids: { pending: 4, accepted: 2 },
        agreements: { active: 1, completed: 5 },
        unreadMessages: 2,
        unreadNotifications: 3,
      }),
      isLoading: false,
      error: null,
      refetch: mockRefetchSummary,
    } as unknown as ReturnType<typeof dashboardApi.useDashboardSummary>);

    vi.mocked(listingsApi.useListings).mockReturnValue({
      data: {
        pages: [
          {
            items: [
              makeListingSummary({
                id: 'listing-1',
                title: 'Fullstack Next.js App',
                kind: 'REQUEST',
                status: 'OPEN',
                priceMinCents: 50000,
                priceMaxCents: null,
                bidCount: 3,
              }),
            ],
            nextCursor: 'next-page-cursor',
          },
        ],
        pageParams: [null],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetchListings,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextListings,
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    vi.mocked(bidsApi.useInfiniteMyBids).mockReturnValue({
      data: {
        pages: [
          {
            items: [
              makeBidWithListing({
                id: 'bid-1',
                amountCents: 25000,
                deliveryDays: 7,
                status: 'PENDING',
                listing: makeListingSummary({
                  id: 'list-bidded',
                  title: 'Mobile App Design',
                }) as unknown as SharedListingSummary,
              }),
            ],
            nextCursor: 'next-bid-cursor',
          },
        ],
        pageParams: [null],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetchBids,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextBids,
    } as unknown as ReturnType<typeof bidsApi.useInfiniteMyBids>);

    vi.mocked(conversationsApi.useInfiniteConversations).mockReturnValue({
      data: {
        pages: [
          {
            items: [
              makeConversation({
                id: 'conv-1',
                unreadCount: 1,
                otherParticipant: makeUser({ id: 'user-other', displayName: 'Partner User' }),
                lastMessage: {
                  id: 'msg-1',
                  conversationId: 'conv-1',
                  sender: makeUser({ id: 'user-other', displayName: 'Partner User' }),
                  type: 'TEXT',
                  body: 'Looking forward to working with you',
                  voiceDurationSec: null,
                  attachments: [],
                  createdAt: new Date('2026-10-15T12:00:00Z'),
                },
              }),
            ],
            nextCursor: null,
          },
        ],
        pageParams: [undefined],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetchConvs,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextConvs,
    } as unknown as ReturnType<typeof conversationsApi.useInfiniteConversations>);

    vi.mocked(agreementsApi.useInfiniteAgreements).mockReturnValue({
      data: {
        pages: [
          {
            items: [
              makeAgreementSummary({
                id: 'ag-1',
                status: 'ACTIVE',
                listing: makeListingSummary({
                  title: 'SEO Optimization Project',
                }) as unknown as SharedListingSummary,
                bid: makeBidWithListing({ amountCents: 80000, currency: 'USD' }),
              }),
            ],
            nextCursor: 'next-ag-cursor',
          },
        ],
        pageParams: [null],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreements,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextAgreements,
    } as unknown as ReturnType<typeof agreementsApi.useInfiniteAgreements>);
  });

  it('renders summary cards with correct metrics and links', () => {
    render(<DashboardPage />);

    // Header
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    // Summary cards metrics
    expect(screen.getByText(/2 open/i)).toBeInTheDocument();
    expect(screen.getByText(/4 pending/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1 active/i)).toHaveLength(2);
    expect(screen.getByLabelText(/2 unread messages/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/3 notifications/i)).toBeInTheDocument();
  });

  it('renders loading skeleton for summary metrics when loading', () => {
    vi.mocked(dashboardApi.useDashboardSummary).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetchSummary,
    } as unknown as ReturnType<typeof dashboardApi.useDashboardSummary>);

    render(<DashboardPage />);
    expect(screen.getByTestId('dashboard-summary-skeleton')).toBeInTheDocument();
  });

  it('renders error state with retry for summary metrics when error occurs', () => {
    vi.mocked(dashboardApi.useDashboardSummary).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Network error'),
      refetch: mockRefetchSummary,
    } as unknown as ReturnType<typeof dashboardApi.useDashboardSummary>);

    render(<DashboardPage />);
    expect(screen.getByText('Failed to load dashboard metrics')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(mockRefetchSummary).toHaveBeenCalled();
  });

  it('renders My Listings tab with data, load more button, and handles empty/error', () => {
    render(<DashboardPage />);

    // Listings tab is default
    expect(screen.getByText('Fullstack Next.js App')).toBeInTheDocument();
    expect(screen.getByText('$500')).toBeInTheDocument();

    // Load more listings
    const loadMoreBtn = screen.getByRole('button', { name: /load more listings/i });
    fireEvent.click(loadMoreBtn);
    expect(mockFetchNextListings).toHaveBeenCalled();
  });

  it('renders My Listings loading and error states', () => {
    vi.mocked(listingsApi.useListings).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetchListings,
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    const { rerender } = render(<DashboardPage />);
    expect(screen.getByTestId('listings-skeleton')).toBeInTheDocument();

    vi.mocked(listingsApi.useListings).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Listings fail'),
      refetch: mockRefetchListings,
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    rerender(<DashboardPage />);
    expect(screen.getByText('Failed to load your listings')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryBtn);
    expect(mockRefetchListings).toHaveBeenCalled();
  });

  it('switches to My Bids tab, renders bid cards, and handles filter changes', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    // Switch to bids tab
    const bidsTabTrigger = screen.getByRole('tab', { name: /my bids/i });
    await user.click(bidsTabTrigger);

    expect(screen.getByText('Mobile App Design')).toBeInTheDocument();
    expect(screen.getByText('$250')).toBeInTheDocument();

    // Click filter button
    const pendingFilter = screen.getByRole('button', { name: 'Pending' });
    await user.click(pendingFilter);

    // Load more bids
    const loadMoreBids = screen.getByRole('button', { name: /load more bids/i });
    await user.click(loadMoreBids);
    expect(mockFetchNextBids).toHaveBeenCalled();
  });

  it('switches to Conversations tab and renders chat items', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    const convTabTrigger = screen.getByRole('tab', { name: /conversations/i });
    await user.click(convTabTrigger);

    expect(screen.getByText('Partner User')).toBeInTheDocument();
    expect(screen.getByText('Looking forward to working with you')).toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeInTheDocument();
  });

  it('switches to Agreements tab and supports dual filtering by status and role', async () => {
    const user = userEvent.setup();
    render(<DashboardPage />);

    // Clicking agreement card switches to agreements tab
    const agreementsCard = screen.getByRole('button', { name: 'View My Agreements' });
    await user.click(agreementsCard);

    expect(screen.getByText('SEO Optimization Project')).toBeInTheDocument();
    expect(screen.getByText('$800')).toBeInTheDocument();

    // Role filter
    const buyerRoleRadio = screen.getByRole('radio', { name: 'As Buyer' });
    await user.click(buyerRoleRadio);

    // Status filter
    const deliveredFilter = screen.getByRole('button', { name: 'Delivered' });
    await user.click(deliveredFilter);

    // Load more agreements
    const loadMoreAg = screen.getByRole('button', { name: /load more agreements/i });
    await user.click(loadMoreAg);
    expect(mockFetchNextAgreements).toHaveBeenCalled();
  });

  it('renders empty states for tabs when no items exist', async () => {
    const user = userEvent.setup();
    vi.mocked(listingsApi.useListings).mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      error: null,
      refetch: mockRefetchListings,
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    vi.mocked(bidsApi.useInfiniteMyBids).mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      error: null,
      refetch: mockRefetchBids,
    } as unknown as ReturnType<typeof bidsApi.useInfiniteMyBids>);

    vi.mocked(agreementsApi.useInfiniteAgreements).mockReturnValue({
      data: { pages: [{ items: [], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      error: null,
      refetch: mockRefetchAgreements,
    } as unknown as ReturnType<typeof agreementsApi.useInfiniteAgreements>);

    render(<DashboardPage />);
    expect(screen.getByText('No listings yet')).toBeInTheDocument();

    // Switch to bids tab
    await user.click(screen.getByRole('tab', { name: /my bids/i }));
    expect(screen.getByText('No bids found')).toBeInTheDocument();

    // Switch to agreements tab
    await user.click(screen.getByRole('tab', { name: /agreements/i }));
    expect(screen.getByText('No agreements found')).toBeInTheDocument();
  });
});
