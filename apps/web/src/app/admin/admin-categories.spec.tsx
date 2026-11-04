import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminCategoriesPage from './categories/page';
import * as AdminApiModule from '@/lib/api/admin';
import * as AuthContextModule from '@/components/auth/auth-provider';
import { api, ApiError } from '@/lib/api/client';
import type { Category } from '@/lib/api/types';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockCategories: Category[] = [
  {
    id: 'cat-root',
    name: 'Technology',
    slug: 'technology',
    parentId: null,
    description: 'Hardware, software, and development services',
    listingCount: 25,
    children: [
      {
        id: 'cat-sub-1',
        name: 'Web Development',
        slug: 'web-development',
        parentId: 'cat-root',
        description: 'Frontend, backend, and full-stack engineering',
        listingCount: 15,
        children: [],
      },
    ],
  },
  {
    id: 'cat-design',
    name: 'Design & Creative',
    slug: 'design-creative',
    parentId: null,
    description: 'UI/UX, graphic design, and illustration',
    listingCount: 10,
    children: [],
  },
];

describe('AdminCategoriesPage', () => {
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

  it('renders loading skeleton while categories load', () => {
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}));

    renderWithClient(<AdminCategoriesPage />);
    expect(screen.getByLabelText(/loading categories tree/i)).toBeInTheDocument();
  });

  it('renders error state when fetching category tree fails', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Failed to fetch categories'));

    renderWithClient(<AdminCategoriesPage />);

    expect(await screen.findByText('Unable to Load Category Tree')).toBeInTheDocument();
  });

  it('renders categories tree with subcategories and listing counts', async () => {
    vi.spyOn(api, 'get').mockResolvedValue(mockCategories);

    renderWithClient(<AdminCategoriesPage />);

    expect(await screen.findByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('Web Development')).toBeInTheDocument();
    expect(screen.getByText('Design & Creative')).toBeInTheDocument();
    expect(screen.getByText('/technology')).toBeInTheDocument();
    expect(screen.getByText('/web-development')).toBeInTheDocument();
    expect(screen.getByText('25 listings')).toBeInTheDocument();
  });

  it('creates a new category with slug derivation and handles success', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockResolvedValue(mockCategories);
    const createSpy = vi.spyOn(AdminApiModule.adminApi, 'createCategory').mockResolvedValueOnce({
      id: 'cat-new',
      name: 'Mobile Development',
      slug: 'mobile-development',
      parentId: 'cat-root',
      description: 'iOS and Android app development',
      listingCount: 0,
      children: [],
    });

    renderWithClient(<AdminCategoriesPage />);

    expect(await screen.findByText('Technology')).toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /add category/i });
    await user.click(addBtn);

    expect(screen.getByRole('heading', { name: /create category/i })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/category name/i);
    await user.type(nameInput, 'Mobile Development');

    // Verify slug was automatically derived
    const slugInput = screen.getByLabelText(/url slug/i);
    expect(slugInput).toHaveValue('mobile-development');

    const descInput = screen.getByLabelText(/description/i);
    await user.type(descInput, 'iOS and Android app development');

    const submitBtn = screen.getByRole('button', { name: /^create category$/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({
        name: 'Mobile Development',
        slug: 'mobile-development',
        parentId: null,
        description: 'iOS and Android app development',
      });
    });
  }, 15000);

  it('handles 409 conflict when slug already exists', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockResolvedValue(mockCategories);
    vi.spyOn(AdminApiModule.adminApi, 'createCategory').mockRejectedValueOnce(
      new ApiError(409, 'Category slug already exists', 'CONFLICT'),
    );

    renderWithClient(<AdminCategoriesPage />);

    expect(await screen.findByText('Technology')).toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /add category/i });
    await user.click(addBtn);

    const nameInput = screen.getByLabelText(/category name/i);
    await user.type(nameInput, 'Technology');

    const submitBtn = screen.getByRole('button', { name: /^create category$/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
    });
  });

  it('deletes category with confirmation dialog and handles 409 conflict when category has listings', async () => {
    const user = userEvent.setup();
    vi.spyOn(api, 'get').mockResolvedValue(mockCategories);
    const deleteSpy = vi
      .spyOn(AdminApiModule.adminApi, 'deleteCategory')
      .mockRejectedValueOnce(new ApiError(409, 'Cannot delete category with listings', 'CONFLICT'));

    renderWithClient(<AdminCategoriesPage />);

    expect(await screen.findByText('Technology')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /delete category technology/i });
    await user.click(deleteBtn);

    // Confirmation dialog appears
    expect(screen.getByRole('heading', { name: /delete category/i })).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete category/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /^delete category$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('cat-root');
    });
  });
});
