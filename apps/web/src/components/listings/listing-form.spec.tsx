import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListingForm } from './listing-form';
import { ApiError } from '@/lib/api/client';
import * as categoriesApi from '@/lib/api/categories';
import * as uploadModule from '@/lib/upload';
import type { Category, CreateListingRequest, UpdateListingRequest } from '@/lib/api/types';
import { makeCategory, makeListingDetail, makePublicUser } from '../../../test/fixtures';

describe('ListingForm component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const mockCategories: Category[] = [
      makeCategory({
        id: 'cat-1',
        name: 'Design & Creative',
        slug: 'design',
        parentId: null,
        children: [],
      }),
      makeCategory({
        id: 'cat-2',
        name: 'Web Development',
        slug: 'web-dev',
        parentId: null,
        children: [],
      }),
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
      expect(
        screen.getByText(/expected string to have >=5 characters|at least 5 characters/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/expected string to have >=20 characters|at least 20 characters/i),
      ).toBeInTheDocument();
      expect(screen.getByText('Please select a category')).toBeInTheDocument();
      expect(screen.getByText('Please enter a valid price')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('updates live character counter for description', () => {
    render(<ListingForm onSubmit={vi.fn()} />);

    expect(screen.getByText('0 / 10,000 characters')).toBeInTheDocument();

    const descInput = screen.getByPlaceholderText(/describe scope, requirements/i);
    fireEvent.change(descInput, { target: { value: 'Building custom responsive layout' } });

    expect(screen.getByText('33 / 10,000 characters')).toBeInTheDocument();
  });

  it('correctly converts major units to cents for FIXED price on submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(data: CreateListingRequest | UpdateListingRequest) => Promise<void>>()
      .mockResolvedValue(undefined);

    const initialListing = makeListingDetail({
      id: 'l-edit',
      title: 'Senior Frontend Engineer needed',
      description: 'We need an experienced developer for our production Next.js app.',
      kind: 'REQUEST',
      status: 'OPEN',
      priceType: 'FIXED',
      priceMinCents: 15000,
      priceMaxCents: 15000,
      currency: 'USD',
      deliveryDays: 5,
      location: 'Remote',
      tags: ['react'],
      categoryId: 'cat-2',
      categoryName: 'Web Development',
      category: { id: 'cat-2', name: 'Web Development', slug: 'web-dev' },
      owner: makePublicUser({
        id: 'u-1',
        displayName: 'Alice',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      }),
      images: [],
      attachments: [],
      bidCount: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

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
    // Finding 3 & 4: FIXED edit sets priceMinCents and clears priceMaxCents to null
    expect(payload.priceMaxCents).toBeNull();
    expect(payload.title).toBe('Senior Frontend Engineer needed');
    // Finding 5: Do not send status on edit of an OPEN listing
    expect(payload.status).toBeUndefined();
  });

  it('submits with status DRAFT when Save Draft button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(data: CreateListingRequest | UpdateListingRequest) => Promise<void>>()
      .mockResolvedValue(undefined);

    const initialListing = makeListingDetail({
      id: 'l-draft',
      title: 'Draft Website Redesign Proposal',
      description: 'Work in progress description that has plenty of length for validation.',
      kind: 'OFFER',
      status: 'DRAFT',
      priceType: 'NEGOTIABLE',
      currency: 'USD',
      tags: [],
      categoryId: 'cat-1',
      categoryName: 'Design',
      category: { id: 'cat-1', name: 'Design', slug: 'design' },
      owner: makePublicUser({
        id: 'u-1',
        displayName: 'Bob',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      }),
      images: [],
      attachments: [],
      bidCount: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

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

  it('sends status OPEN when publishing a DRAFT listing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(data: CreateListingRequest | UpdateListingRequest) => Promise<void>>()
      .mockResolvedValue(undefined);

    const initialDraftListing = makeListingDetail({
      id: 'l-draft-publish',
      title: 'Draft Proposal to Publish',
      description: 'Long enough description text for testing publication of a draft listing.',
      kind: 'OFFER',
      status: 'DRAFT',
      priceType: 'FIXED',
      priceMinCents: 10000,
      priceMaxCents: null,
      currency: 'USD',
      tags: [],
      categoryId: 'cat-1',
      categoryName: 'Design',
      category: { id: 'cat-1', name: 'Design', slug: 'design' },
      owner: makePublicUser({
        id: 'u-1',
        displayName: 'Bob',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      }),
      images: [],
      attachments: [],
      bidCount: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    render(<ListingForm initialListing={initialDraftListing} onSubmit={onSubmit} />);

    const publishBtn = screen.getByRole('button', { name: /publish listing/i });
    await user.click(publishBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.status).toBe('OPEN');
    expect(payload.priceMinCents).toBe(10000);
    expect(payload.priceMaxCents).toBeNull();
  });

  it('displays the currency symbol from the selected currency', () => {
    const initialListing = makeListingDetail({
      id: 'l-eur',
      title: 'European Consulting Service',
      description: 'Comprehensive business consulting services in Europe.',
      kind: 'OFFER',
      status: 'OPEN',
      priceType: 'FIXED',
      priceMinCents: 5000,
      priceMaxCents: null,
      currency: 'EUR',
      tags: [],
      categoryId: 'cat-1',
      categoryName: 'Design',
      category: { id: 'cat-1', name: 'Design', slug: 'design' },
      owner: makePublicUser({
        id: 'u-1',
        displayName: 'Alice',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      }),
      images: [],
      attachments: [],
      bidCount: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    render(<ListingForm initialListing={initialListing} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText(/price \(€\)/i)).toBeInTheDocument();
  });

  it('maps server VALIDATION_ERROR details to form field errors', async () => {
    const user = userEvent.setup();
    const validationError = new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', [
      { path: ['title'], message: 'Title contains prohibited words' },
    ]);
    const onSubmit = vi.fn().mockRejectedValue(validationError);

    const initialListing = makeListingDetail({
      id: 'l-err',
      title: 'Prohibited keyword title',
      description: 'Valid length description text for testing validation error mapping.',
      kind: 'REQUEST',
      status: 'OPEN',
      priceType: 'NEGOTIABLE',
      currency: 'USD',
      tags: [],
      categoryId: 'cat-1',
      categoryName: 'Design',
      category: { id: 'cat-1', name: 'Design', slug: 'design' },
      owner: makePublicUser({
        id: 'u-1',
        displayName: 'Carol',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      }),
      images: [],
      attachments: [],
      bidCount: 0,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    render(<ListingForm initialListing={initialListing} onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Title contains prohibited words')).toBeInTheDocument();
    });
  });

  it('does not send unchanged expiresAt on edit in onSubmit payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi
      .fn<(data: CreateListingRequest | UpdateListingRequest) => Promise<void>>()
      .mockResolvedValue(undefined);

    const initialListing = makeListingDetail({
      id: 'l-expiry',
      title: 'Listing with Existing Expiry',
      description: 'A sufficiently long description for testing unchanged expiry omission.',
      kind: 'REQUEST',
      status: 'OPEN',
      priceType: 'FIXED',
      priceMinCents: 5000,
      priceMaxCents: 5000,
      currency: 'USD',
      tags: [],
      categoryId: 'cat-1',
      categoryName: 'Design',
      category: { id: 'cat-1', name: 'Design', slug: 'design' },
      owner: makePublicUser({
        id: 'u-1',
        displayName: 'Alice',
        isBusiness: false,
        createdAt: '2026-01-01T00:00:00Z',
      }),
      images: [],
      attachments: [],
      bidCount: 0,
      expiresAt: '2026-11-20T21:59:59.999Z',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    });

    render(<ListingForm initialListing={initialListing} onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: /save changes/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.expiresAt).toBeUndefined();
    expect('expiresAt' in payload).toBe(false);
  });

  it('displays error message when price exceeds int4 limit (21,474,836.47)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ListingForm onSubmit={onSubmit} />);

    // Select category and type title and description
    const titleInput = screen.getByLabelText(/^title/i);
    const descInput = screen.getByPlaceholderText(/describe scope, requirements/i);
    const priceInput = screen.getByLabelText(/price \(\$\)/i);

    fireEvent.change(titleInput, { target: { value: 'Valid Project Title Here' } });
    fireEvent.change(descInput, {
      target: { value: 'Valid description that has plenty of length for form submission.' },
    });
    fireEvent.change(priceInput, { target: { value: '21474836.48' } });

    const publishBtn = screen.getByRole('button', { name: /publish listing/i });
    await user.click(publishBtn);

    await waitFor(() => {
      expect(screen.getByText('Price cannot exceed 21,474,836.47')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables Publish and Save Draft buttons while upload is in flight or errored, and enables after dismiss', async () => {
    const user = userEvent.setup();
    let rejectUpload: (reason: Error) => void;
    const uploadPromise = new Promise<never>((_, reject) => {
      rejectUpload = reject;
    });

    vi.spyOn(uploadModule, 'uploadFile').mockReturnValue(uploadPromise);

    const { container } = render(<ListingForm onSubmit={vi.fn()} />);

    const publishBtn = screen.getByRole('button', { name: /publish listing/i });
    const draftBtn = screen.getByRole('button', { name: /save draft/i });

    expect(publishBtn).not.toBeDisabled();
    expect(draftBtn).not.toBeDisabled();

    // Trigger file drop/upload
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['test'], 'photo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    // While upload is in flight -> buttons are disabled
    await waitFor(() => {
      expect(publishBtn).toBeDisabled();
      expect(draftBtn).toBeDisabled();
    });

    // Fail upload
    rejectUpload!(new Error('Upload failed'));

    // While errored -> buttons remain disabled
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
      expect(publishBtn).toBeDisabled();
      expect(draftBtn).toBeDisabled();
    });

    // Dismiss errored upload
    const dismissBtn = screen.getByRole('button', { name: /dismiss error for photo\.png/i });
    await user.click(dismissBtn);

    // After dismiss -> buttons become enabled again
    await waitFor(() => {
      expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
      expect(publishBtn).not.toBeDisabled();
      expect(draftBtn).not.toBeDisabled();
    });
  });
});
