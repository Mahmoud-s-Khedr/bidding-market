import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ListingDetailPage from './[id]/page';
import * as listingsApi from '@/lib/api/listings';
import * as authContext from '@/components/auth/auth-provider';
import { ApiError } from '@/lib/api/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import type { ListingDetail } from '@/lib/api/types';

function renderWithToast(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'listing-123' }),
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('Listing Detail Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockListing: ListingDetail = {
    id: 'listing-123',
    title: 'Brand Identity Design',
    description: 'Complete brand guide, vector logos, typography and color palettes.',
    kind: 'OFFER',
    status: 'OPEN',
    priceType: 'FIXED',
    priceMinCents: 120000,
    priceMaxCents: 120000,
    currency: 'USD',
    deliveryDays: 10,
    location: 'Remote',
    tags: ['branding', 'design'],
    categoryId: 'c-design',
    category: { id: 'c-design', name: 'Design', slug: 'design' },
    owner: {
      id: 'user-owner',
      displayName: 'Creative Studio',
      isBusiness: true,
      companyName: 'Studio Inc',
      ratingAvg: 4.9,
      ratingCount: 20,
      completedCount: 15,
      createdAt: '2026-01-01T00:00:00Z',
    },
    images: [],
    attachments: [],
    bidCount: 5,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  it('renders listing overview, price, tags, and owner information', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByText('Brand Identity Design')).toBeInTheDocument();
    expect(screen.getByText('$1,200')).toBeInTheDocument();
    expect(screen.getByText('Creative Studio')).toBeInTheDocument();
    expect(screen.getByText('Studio Inc')).toBeInTheDocument();
    expect(screen.getByText('branding')).toBeInTheDocument();
  });

  it('shows owner actions (Edit, Close, Delete) when authenticated as owner', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-owner',
        email: 'owner@test.com',
        displayName: 'Creative Studio',
        role: 'USER',
        isBusiness: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-owner',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByRole('link', { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('shows action buttons for non-owner', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-other',
        email: 'other@test.com',
        displayName: 'Other User',
        role: 'USER',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      token: 'jwt-owner',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: mockListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByRole('button', { name: /place a bid/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /message owner/i })).toBeInTheDocument();
  });

  it('renders not found empty state when listing returns 404', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new ApiError(404, 'Listing not found', 'NOT_FOUND'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithToast(<ListingDetailPage />);

    expect(screen.getByText('Listing Not Found')).toBeInTheDocument();
  });
});
