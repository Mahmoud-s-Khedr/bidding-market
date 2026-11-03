import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import EditListingPage from './page';
import * as listingsApi from '@/lib/api/listings';
import * as authContext from '@/components/auth/auth-provider';
import * as categoriesApi from '@/lib/api/categories';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import type { ListingDetail, ListingStatus } from '@/lib/api/types';
import { makeCategory, makeListingDetail, makePublicUser } from '../../../../../test/fixtures';

function renderWithProviders(ui: React.ReactElement) {
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
  useParams: () => ({ id: 'listing-edit-123' }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => '/listings/listing-edit-123/edit',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Edit Listing Page', () => {
  const ownerUser = {
    id: 'user-owner-1',
    email: 'owner@test.com',
    displayName: 'Owner User',
    role: 'USER' as const,
    isBusiness: false,
    createdAt: '2026-01-01T00:00:00Z',
  };

  const baseListing: ListingDetail = makeListingDetail({
    id: 'listing-edit-123',
    title: 'Editable Project Title',
    description: 'This is a sufficiently long description that satisfies validation requirements.',
    kind: 'REQUEST',
    status: 'OPEN',
    priceType: 'FIXED',
    priceMinCents: 5000,
    priceMaxCents: 5000,
    currency: 'USD',
    deliveryDays: 5,
    location: 'Remote',
    tags: ['web'],
    categoryId: 'cat-1',
    categoryName: 'Tech',
    category: { id: 'cat-1', name: 'Tech', slug: 'tech' },
    owner: makePublicUser({
      id: 'user-owner-1',
      displayName: 'Owner User',
      isBusiness: false,
      createdAt: '2026-01-01T00:00:00Z',
    }),
    images: [],
    attachments: [],
    bidCount: 0,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  });

  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
      data: [makeCategory({ id: 'cat-1', name: 'Tech', slug: 'tech' })],
      isLoading: false,
    } as ReturnType<typeof categoriesApi.useCategories>);

    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: ownerUser,
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(listingsApi, 'useUpdateListing').mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as unknown as ReturnType<typeof listingsApi.useUpdateListing>);
  });

  it('renders edit form when listing status is OPEN', () => {
    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: { ...baseListing, status: 'OPEN' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithProviders(<EditListingPage />);

    expect(screen.getByRole('heading', { name: /edit listing/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^title/i)).toHaveValue('Editable Project Title');
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('renders edit form when listing status is DRAFT', () => {
    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: { ...baseListing, status: 'DRAFT' },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithProviders(<EditListingPage />);

    expect(screen.getByRole('heading', { name: /edit listing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /publish listing/i })).toBeInTheDocument();
  });

  const nonEditableStatuses: ListingStatus[] = ['IN_PROGRESS', 'COMPLETED', 'CLOSED', 'REMOVED'];

  nonEditableStatuses.forEach((status) => {
    it(`blocks edit and shows read-only message with link back for status ${status}`, () => {
      vi.spyOn(listingsApi, 'useListing').mockReturnValue({
        data: { ...baseListing, status },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      } as unknown as ReturnType<typeof listingsApi.useListing>);

      renderWithProviders(<EditListingPage />);

      // Read-only block is displayed
      expect(screen.getByText('Listing Cannot Be Edited')).toBeInTheDocument();
      expect(
        screen.getByText(`Listings in ${status} status cannot be edited.`),
      ).toBeInTheDocument();

      // Link back is present
      const backLink = screen.getByRole('link', { name: /return to listing/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/listings/listing-edit-123');

      // The form itself is NOT rendered
      expect(screen.queryByLabelText(/^title/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    });
  });

  it('shows Access Denied when viewer is not the owner', () => {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      user: { ...ownerUser, id: 'user-other' },
      token: 'jwt-token',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });

    vi.spyOn(listingsApi, 'useListing').mockReturnValue({
      data: baseListing,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof listingsApi.useListing>);

    renderWithProviders(<EditListingPage />);

    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(
      screen.getByText(
        'You do not have permission to edit this listing because you are not the owner.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^title/i)).not.toBeInTheDocument();
  });
});
