import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminListingsPage from './listings/page';
import * as AuthContextModule from '@/components/auth/auth-provider';
import * as AdminApiModule from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockListings: AdminApiModule.AdminListingItem[] = [
  {
    id: 'list-1',
    title: 'Custom E-commerce Store',
    description: 'Complete e-commerce platform using Next.js and Stripe',
    kind: 'OFFER',
    status: 'OPEN',
    categoryId: 'cat-1',
    priceType: 'FIXED',
    priceMinCents: 150000,
    priceMaxCents: null,
    currency: 'USD',
    deliveryDays: 14,
    location: null,
    removedReason: null,
    removedAt: null,
    previousStatus: null,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    expiresAt: null,
    owner: { id: 'user-1', displayName: 'Alice Seller' },
  },
  {
    id: 'list-2',
    title: 'Prohibited Counterfeit Goods',
    description: 'Fake items violating marketplace policies',
    kind: 'OFFER',
    status: 'REMOVED',
    categoryId: 'cat-2',
    priceType: 'FIXED',
    priceMinCents: 5000,
    priceMaxCents: null,
    currency: 'USD',
    deliveryDays: 3,
    location: null,
    removedReason: 'Prohibited counterfeit goods violation',
    removedAt: '2026-02-02T00:00:00.000Z',
    previousStatus: 'OPEN',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
    expiresAt: null,
    owner: { id: 'user-2', displayName: 'Spammer Bob' },
  },
];

describe('AdminListingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'admin-1',
        email: 'admin@market.test',
        displayName: 'Root Admin',
        role: 'ADMIN',
        isBusiness: false,
        createdAt: '',
      },
      token: 'jwt',
      isLoading: false,
      isAuthenticated: true,
      isAdmin: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
    });
  });

  it('renders loading state initially', () => {
    vi.spyOn(AdminApiModule.adminApi, 'fetchListings').mockImplementation(
      () => new Promise(() => {}),
    );

    renderWithClient(<AdminListingsPage />);
    expect(screen.getByLabelText(/loading listings moderation list/i)).toBeInTheDocument();
  });

  it('renders error state with retry option', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(AdminApiModule.adminApi, 'fetchListings')
      .mockRejectedValueOnce(new Error('Server error'));

    renderWithClient(<AdminListingsPage />);

    expect(await screen.findByText('Failed to Load Listings')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fetchSpy.mockResolvedValueOnce({ items: mockListings, nextCursor: null });
    await user.click(retryBtn);

    expect(await screen.findByText('Custom E-commerce Store')).toBeInTheDocument();
  });

  it('renders listings table with open and removed statuses', async () => {
    vi.spyOn(AdminApiModule.adminApi, 'fetchListings').mockResolvedValue({
      items: mockListings,
      nextCursor: null,
    });

    renderWithClient(<AdminListingsPage />);

    expect(await screen.findByText('Custom E-commerce Store')).toBeInTheDocument();
    expect(screen.getByText('Prohibited Counterfeit Goods')).toBeInTheDocument();
    expect(screen.getByText(/Reason: Prohibited counterfeit goods violation/i)).toBeInTheDocument();

    // Verify action buttons: Remove on open listing, Restore on removed listing
    expect(
      screen.getByRole('button', { name: /remove listing custom e-commerce store/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /restore listing prohibited counterfeit goods/i }),
    ).toBeInTheDocument();
  });

  it('opens remove dialog, validates reason, and removes listing', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchListings').mockResolvedValue({
      items: mockListings,
      nextCursor: null,
    });
    const targetListing = mockListings[0];
    if (!targetListing) throw new Error('Missing mock listing');
    const removedListing: AdminApiModule.AdminListingItem = {
      ...targetListing,
      status: 'REMOVED',
    };
    const removeSpy = vi
      .spyOn(AdminApiModule.adminApi, 'removeListing')
      .mockResolvedValueOnce(removedListing);

    renderWithClient(<AdminListingsPage />);

    expect(await screen.findByText('Custom E-commerce Store')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', {
      name: /remove listing custom e-commerce store/i,
    });
    await user.click(removeBtn);

    expect(
      screen.getByRole('heading', { name: /remove marketplace listing/i }),
    ).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/reason for takedown/i);
    await user.type(reasonInput, 'Policy violation: prohibited terms');

    const confirmBtn = screen.getByRole('button', { name: /confirm removal/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledWith('list-1', {
        reason: 'Policy violation: prohibited terms',
      });
    });
  });

  it('opens restore dialog and restores listing', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchListings').mockResolvedValue({
      items: mockListings,
      nextCursor: null,
    });
    const targetListing = mockListings[1];
    if (!targetListing) throw new Error('Missing mock listing');
    const restoredListing: AdminApiModule.AdminListingItem = {
      ...targetListing,
      status: 'OPEN',
    };
    const restoreSpy = vi
      .spyOn(AdminApiModule.adminApi, 'restoreListing')
      .mockResolvedValueOnce(restoredListing);

    renderWithClient(<AdminListingsPage />);

    expect(await screen.findByText('Prohibited Counterfeit Goods')).toBeInTheDocument();

    const restoreBtn = screen.getByRole('button', {
      name: /restore listing prohibited counterfeit goods/i,
    });
    await user.click(restoreBtn);

    expect(screen.getByRole('heading', { name: /restore listing/i })).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/reason for restoration/i);
    await user.type(reasonInput, 'Seller provided valid authenticity documentation');

    const confirmBtn = screen.getByRole('button', { name: /confirm restoration/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith('list-2', {
        reason: 'Seller provided valid authenticity documentation',
      });
    });
  });

  it('handles 409 conflict when listing is already removed', async () => {
    const user = userEvent.setup();
    vi.spyOn(AdminApiModule.adminApi, 'fetchListings').mockResolvedValue({
      items: mockListings,
      nextCursor: null,
    });
    vi.spyOn(AdminApiModule.adminApi, 'removeListing').mockRejectedValueOnce(
      new ApiError(409, 'Listing is already removed', 'CONFLICT'),
    );

    renderWithClient(<AdminListingsPage />);

    expect(await screen.findByText('Custom E-commerce Store')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', {
      name: /remove listing custom e-commerce store/i,
    });
    await user.click(removeBtn);

    const reasonInput = screen.getByLabelText(/reason for takedown/i);
    await user.type(reasonInput, 'Duplicate takedown test');

    const confirmBtn = screen.getByRole('button', { name: /confirm removal/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already removed/i);
    });
  });
});
