import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserProfilePage from './[id]/page';
import * as usersApi from '@/lib/api/users';
import * as listingsApi from '@/lib/api/listings';
import type { ListingSummary, PublicUser, ReviewItem } from '@/lib/api/types';
import { makeListingSummary, makePublicUser } from '../../../test/fixtures';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'user-profile-1' }),
}));

describe('User Profile Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockUser: PublicUser = makePublicUser({
    id: 'user-profile-1',
    displayName: 'Elena Rostova',
    avatarUrl: null,
    bio: 'Senior UX/UI Designer with 8 years of experience.',
    location: 'Berlin, Germany',
    isBusiness: true,
    companyName: 'Rostova Design GmbH',
    ratingAvg: 4.8,
    ratingCount: 25,
    completedCount: 30,
    createdAt: '2024-03-15T00:00:00Z',
  });

  const mockListing: ListingSummary = makeListingSummary({
    id: 'l-user-1',
    title: 'Mobile App Wireframes & Figma UI Kit',
    kind: 'OFFER',
    status: 'OPEN',
    priceType: 'FIXED',
    priceMinCents: 80000,
    priceMaxCents: null,
    currency: 'USD',
    location: 'Remote',
    categoryId: 'c-design',
    categoryName: 'Design',
    thumbnailUrl: null,
    owner: mockUser,
    bidCount: 4,
    createdAt: '2026-10-01T00:00:00Z',
  });

  const mockReview: ReviewItem = {
    id: 'rev-1',
    agreementId: 'agr-1',
    rating: 5,
    comment: 'Exceptional quality of work and prompt delivery!',
    createdAt: '2026-09-10T00:00:00Z',
    author: {
      id: 'author-1',
      displayName: 'Mark Client',
      isBusiness: false,
      createdAt: '2025-01-01T00:00:00Z',
    },
  };

  it('renders user header with name, business badge, bio, location, and rating', () => {
    vi.spyOn(usersApi, 'usePublicUser').mockReturnValue({
      data: mockUser,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usersApi.usePublicUser>);

    vi.spyOn(listingsApi, 'useListings').mockReturnValue({
      data: { pages: [{ items: [mockListing], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    vi.spyOn(usersApi, 'useUserReviews').mockReturnValue({
      data: { pages: [{ items: [mockReview], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usersApi.useUserReviews>);

    render(<UserProfilePage />);

    expect(screen.getByRole('heading', { name: 'Elena Rostova' })).toBeInTheDocument();
    expect(screen.getByText(/Rostova Design GmbH/)).toBeInTheDocument();
    expect(screen.getByText('Berlin, Germany')).toBeInTheDocument();
    expect(screen.getByText(/30 completed agreements/)).toBeInTheDocument();
  });

  it('toggles between Listings and Reviews tabs', async () => {
    const user = userEvent.setup();

    vi.spyOn(usersApi, 'usePublicUser').mockReturnValue({
      data: mockUser,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usersApi.usePublicUser>);

    vi.spyOn(listingsApi, 'useListings').mockReturnValue({
      data: { pages: [{ items: [mockListing], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListings>);

    vi.spyOn(usersApi, 'useUserReviews').mockReturnValue({
      data: { pages: [{ items: [mockReview], nextCursor: null }], pageParams: [null] },
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof usersApi.useUserReviews>);

    render(<UserProfilePage />);

    // Default tab is listings
    expect(screen.getByText('Mobile App Wireframes & Figma UI Kit')).toBeInTheDocument();

    // Click reviews tab
    const reviewsTab = screen.getByRole('tab', { name: /reviews/i });
    await user.click(reviewsTab);

    await waitFor(() => {
      expect(
        screen.getByText('Exceptional quality of work and prompt delivery!'),
      ).toBeInTheDocument();
      expect(screen.getByText('Mark Client')).toBeInTheDocument();
    });
  });
});
