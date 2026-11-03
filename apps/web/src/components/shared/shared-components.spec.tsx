import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RatingStars } from './rating-stars';
import { PriceTag } from './price-tag';
import { TagsInput } from './tags-input';
import { ImageGallery } from './image-gallery';
import { ConfirmDialog } from './confirm-dialog';
import { CategorySelect } from './category-select';
import { ListingCard } from './listing-card';
import * as categoriesApi from '@/lib/api/categories';
import type { Category, ListingSummary } from '@/lib/api/types';
import { makeCategory, makeListingSummary, makePublicUser } from '../../../test/fixtures';

describe('Shared Components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('RatingStars', () => {
    it('renders accessible label with formatted score', () => {
      render(<RatingStars rating={4.5} count={12} />);
      const el = screen.getByRole('img', { name: '4.5 out of 5' });
      expect(el).toBeInTheDocument();
      expect(screen.getByText('(12)')).toBeInTheDocument();
    });

    it('handles zero or missing rating gracefully', () => {
      render(<RatingStars rating={null} />);
      expect(screen.getByRole('img', { name: '0.0 out of 5' })).toBeInTheDocument();
    });
  });

  describe('PriceTag', () => {
    it('renders FIXED price in dollars from cents', () => {
      render(<PriceTag priceType="FIXED" priceMinCents={4500} currency="USD" />);
      expect(screen.getByText('$45')).toBeInTheDocument();
    });

    it('renders RANGE price with min and max', () => {
      render(
        <PriceTag priceType="RANGE" priceMinCents={2000} priceMaxCents={5000} currency="USD" />,
      );
      expect(screen.getByText('$20 – $50')).toBeInTheDocument();
    });

    it('renders NEGOTIABLE price text', () => {
      render(<PriceTag priceType="NEGOTIABLE" />);
      expect(screen.getByText('Negotiable')).toBeInTheDocument();
    });
  });

  describe('TagsInput', () => {
    it('renders current tags as badges with remove buttons', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagsInput value={['react', 'nextjs']} onChange={onChange} />);

      expect(screen.getByText('react')).toBeInTheDocument();
      expect(screen.getByText('nextjs')).toBeInTheDocument();

      const removeBtn = screen.getByRole('button', { name: 'Remove tag react' });
      await user.click(removeBtn);

      expect(onChange).toHaveBeenCalledWith(['nextjs']);
    });

    it('adds new tag on Enter or comma', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagsInput value={['react']} onChange={onChange} maxTags={10} />);

      const input = screen.getByRole('textbox');
      await user.type(input, 'typescript{enter}');

      expect(onChange).toHaveBeenCalledWith(['react', 'typescript']);
    });

    it('removes last tag on backspace when input is empty', () => {
      const onChange = vi.fn();
      render(<TagsInput value={['alpha', 'beta']} onChange={onChange} />);

      const input = screen.getByRole('textbox');
      fireEvent.keyDown(input, { key: 'Backspace' });

      expect(onChange).toHaveBeenCalledWith(['alpha']);
    });
  });

  describe('ImageGallery', () => {
    const mockImages = [
      {
        id: '1',
        key: '1',
        url: 'https://ex.com/1.jpg',
        fileName: '1.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
      },
      {
        id: '2',
        key: '2',
        url: 'https://ex.com/2.jpg',
        fileName: '2.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 200,
      },
    ];

    it('renders empty fallback when images array is empty', () => {
      render(<ImageGallery images={[]} />);
      expect(screen.getByText('No images provided')).toBeInTheDocument();
    });

    it('renders active image and allows navigation via buttons', async () => {
      const user = userEvent.setup();
      render(<ImageGallery images={mockImages} title="Test Item" />);

      expect(screen.getByText('1 / 2')).toBeInTheDocument();

      const nextBtn = screen.getByRole('button', { name: 'Next view' });
      await user.click(nextBtn);

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });

    it('allows keyboard navigation via thumbnail buttons', () => {
      render(<ImageGallery images={mockImages} title="Item" />);

      const thumb1 = screen.getByRole('button', { name: 'Thumbnail 1' });
      fireEvent.keyDown(thumb1, { key: 'ArrowRight' });

      expect(screen.getByText('2 / 2')).toBeInTheDocument();
    });
  });

  describe('ConfirmDialog', () => {
    it('renders dialog title, description and handles confirmation', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();

      render(
        <ConfirmDialog
          open={true}
          onOpenChange={onOpenChange}
          title="Delete Confirmation"
          description="Are you sure you want to proceed?"
          confirmText="Yes, Delete"
          onConfirm={onConfirm}
        />,
      );

      expect(screen.getByText('Delete Confirmation')).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Yes, Delete' });
      await user.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe('CategorySelect', () => {
    const mockTree: Category[] = [
      makeCategory({
        id: 'c-tech',
        name: 'Technology',
        slug: 'technology',
        parentId: null,
        children: [
          makeCategory({
            id: 'c-web',
            name: 'Web Dev',
            slug: 'web-dev',
            parentId: 'c-tech',
            children: [],
          }),
        ],
      }),
    ];

    it('flattens categories hierarchy into selectable list', () => {
      vi.spyOn(categoriesApi, 'useCategories').mockReturnValue({
        data: mockTree,
        isLoading: false,
      } as ReturnType<typeof categoriesApi.useCategories>);

      render(<CategorySelect placeholder="Choose specialty" />);

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('ListingCard', () => {
    const mockListing: ListingSummary = makeListingSummary({
      id: 'list-123',
      title: 'Fullstack Next.js Developer needed',
      kind: 'REQUEST',
      status: 'OPEN',
      priceType: 'FIXED',
      priceMinCents: 50000,
      priceMaxCents: null,
      currency: 'USD',
      location: 'Remote',
      categoryId: 'c-web',
      categoryName: 'Web Development',
      thumbnailUrl: 'https://ex.com/hero.jpg',
      owner: makePublicUser({
        id: 'u-alice',
        displayName: 'Alice Cooper',
        isBusiness: false,
        ratingAvg: 4.8,
        ratingCount: 15,
        completedCount: 10,
        createdAt: '2026-01-01T00:00:00Z',
      }),
      bidCount: 3,
      createdAt: '2026-10-01T00:00:00Z',
    });

    it('renders listing card with title, kind, price, category, and owner details (Finding 7)', () => {
      const { container } = render(<ListingCard listing={mockListing} />);

      expect(screen.getByText('Fullstack Next.js Developer needed')).toBeInTheDocument();
      expect(screen.getByText('Request')).toBeInTheDocument();
      expect(screen.getByText('Web Development')).toBeInTheDocument();
      expect(screen.getByText('$500')).toBeInTheDocument();
      expect(screen.getByText('Alice Cooper')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
      // Thumbnail rendered
      const img = container.querySelector('img[src="https://ex.com/hero.jpg"]');
      expect(img).toBeInTheDocument();
    });

    it('hides category label and does not render raw cuid when categoryName is empty (Finding 7)', () => {
      const listingWithoutCategoryName: ListingSummary = makeListingSummary({
        ...mockListing,
        categoryId: 'c-design',
        categoryName: '',
        thumbnailUrl: null,
      });

      const { container } = render(<ListingCard listing={listingWithoutCategoryName} />);
      expect(container).not.toHaveTextContent('c-design');
    });
  });
});
