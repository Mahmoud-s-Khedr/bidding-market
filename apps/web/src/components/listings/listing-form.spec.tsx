import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingForm } from './listing-form';
import { ApiError } from '@/lib/api/client';
import * as categoriesApi from '@/lib/api/categories';
import type { Category, CreateListingRequest } from '@/lib/api/types';

describe('ListingForm component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const mockCategories: Category[] = [
      { id: 'cat-1', name: 'Design & Creative', slug: 'design', parentId: null, children: [] },
      { id: 'cat-2', name: 'Web Development', slug: 'web-dev', parentId: null, children: [] },
    ];
    vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
      data: mockCategories,
      isLoading: false,
    } as ReturnType<typeof categoriesApi.useCategories>);
  });

  it('displays validation errors when submitting empty required fields', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ListingForm onSubmit={onSubmit} />);

    const publishBtn = screen.getByRole('button', { name: /publish listing/i });
    await user.click(publishBtn);

    await waitFor(() => {
      expect(screen.getByText('Title must be at least 5 characters')).toBeInTheDocument();
      expect(screen.getByText('Description must be at least 20 characters')).toBeInTheDocument();
      expect(screen.getByText('Please select a category')).toBeInTheDocument();
      expect(screen.getByText('Please enter a valid price')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('updates live character counter for description', async () => {
    const user = userEvent.setup();
    render(<ListingForm onSubmit={vi.fn()} />);

    expect(screen.getByText('0 / 10,000 characters')).toBeInTheDocument();

    const descInput = screen.getByPlaceholderText(/describe scope, requirements/i);
    await user.type(descInput, 'Building custom responsive layout');

    expect(screen.getByText('33 / 10,000 characters')).toBeInTheDocument();
  });

  it('correctly converts major units to cents for FIXED price on submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(data: CreateListingRequest) => Promise<void>>()
      .mockResolvedValue(undefined);

    const initialListing = {
      id: 'l-edit',
      title: 'Senior Frontend Engineer needed',
      description: 'We need an experienced developer for our production Next.js app.',
      kind: 'REQUEST' as const,
      status: 'OPEN' as const,
      priceType: 'FIXED' as const,
      priceMinCents: 15000,
      priceMaxCents: 15000,
      currency: 'USD',
      deliveryDays: 5,
      location: 'Remote',
      tags: ['react'],
      categoryId: 'cat-2',
      category: { id: 'cat-2', name: 'Web Development', slug: 'web-dev' },
      ownerId: 'u-1',
      owner: {
        id: 'u-1',
        displayName: 'Alice',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      images: [],
      attachments: [],
      bidCount: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    render(<ListingForm initialListing={initialListing} onSubmit={onSubmit} />);

    // Price is initialized to 150 (from 15000 cents)
    const priceInput = screen.getByLabelText(/price \(\$\)/i);
    expect(priceInput).toHaveValue(150);

    // Change to 200.50
    await user.clear(priceInput);
    await user.type(priceInput, '200.50');

    const submitBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.priceMinCents).toBe(20050);
    expect(payload.priceMaxCents).toBe(20050);
    expect(payload.title).toBe('Senior Frontend Engineer needed');
    expect(payload.status).toBe('OPEN');
  });

  it('submits with status DRAFT when Save Draft button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(data: CreateListingRequest) => Promise<void>>()
      .mockResolvedValue(undefined);

    const initialListing = {
      id: 'l-draft',
      title: 'Draft Website Redesign Proposal',
      description: 'Work in progress description that has plenty of length for validation.',
      kind: 'OFFER' as const,
      status: 'DRAFT' as const,
      priceType: 'NEGOTIABLE' as const,
      currency: 'USD',
      tags: [],
      categoryId: 'cat-1',
      category: { id: 'cat-1', name: 'Design', slug: 'design' },
      ownerId: 'u-1',
      owner: {
        id: 'u-1',
        displayName: 'Bob',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      images: [],
      attachments: [],
      bidCount: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    render(<ListingForm initialListing={initialListing} onSubmit={onSubmit} />);

    const draftBtn = screen.getByRole('button', { name: /save draft/i });
    await user.click(draftBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.status).toBe('DRAFT');
    expect(payload.priceMinCents).toBeNull();
    expect(payload.priceMaxCents).toBeNull();
  });

  it('maps server VALIDATION_ERROR details to form field errors', async () => {
    const user = userEvent.setup();
    const validationError = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', [
      { path: ['title'], message: 'Title contains prohibited words' },
    ]);
    const onSubmit = vi.fn().mockRejectedValue(validationError);

    const initialListing = {
      id: 'l-err',
      title: 'Prohibited keyword title',
      description: 'Valid length description text for testing validation error mapping.',
      kind: 'REQUEST' as const,
      status: 'OPEN' as const,
      priceType: 'NEGOTIABLE' as const,
      currency: 'USD',
      tags: [],
      categoryId: 'cat-1',
      category: { id: 'cat-1', name: 'Design', slug: 'design' },
      ownerId: 'u-1',
      owner: {
        id: 'u-1',
        displayName: 'Carol',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
      images: [],
      attachments: [],
      bidCount: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    };

    render(<ListingForm initialListing={initialListing} onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Title contains prohibited words')).toBeInTheDocument();
    });
  });
});
