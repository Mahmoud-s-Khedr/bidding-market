import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidForm, bidFormSchema } from './bid-form';
import { ApiError } from '@/lib/api/client';
import { makeBid, makeListingDetail } from '../../../test/fixtures';

describe('BidForm Schema & Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockListing = makeListingDetail({
    id: 'listing-1',
    priceType: 'RANGE',
    priceMinCents: 10000,
    priceMaxCents: 20000,
    currency: 'USD',
    deliveryDays: 7,
  });

  describe('bidFormSchema validation', () => {
    it('validates and transforms valid values', () => {
      const res = bidFormSchema.safeParse({
        amount: 150.5,
        currency: 'USD',
        deliveryDays: 5,
        message: 'A qualified proposal',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.amount).toBe(150.5);
        expect(res.data.deliveryDays).toBe(5);
      }
    });

    it('rejects invalid or non-positive amount', () => {
      expect(bidFormSchema.safeParse({ amount: -5, deliveryDays: 5, message: '' }).success).toBe(
        false,
      );
      expect(bidFormSchema.safeParse({ amount: 0, deliveryDays: 5, message: '' }).success).toBe(
        false,
      );
      expect(
        bidFormSchema.safeParse({ amount: 'invalid', deliveryDays: 5, message: '' }).success,
      ).toBe(false);
    });

    it('rejects amount exceeding MAX_INT4 in dollars (21,474,836.47)', () => {
      expect(
        bidFormSchema.safeParse({
          amount: 21474836.47,
          deliveryDays: 5,
          message: 'Max valid',
        }).success,
      ).toBe(true);

      const over = bidFormSchema.safeParse({
        amount: 21474836.48,
        deliveryDays: 5,
        message: 'Over limit',
      });
      expect(over.success).toBe(false);
      if (!over.success) {
        expect(over.error.issues[0]?.message).toBe('Bid amount cannot exceed 21,474,836.47');
      }
    });

    it('enforces delivery days integer and max 3650 limit', () => {
      expect(
        bidFormSchema.safeParse({ amount: 100, deliveryDays: 3650, message: '' }).success,
      ).toBe(true);

      const over = bidFormSchema.safeParse({
        amount: 100,
        deliveryDays: 3651,
        message: '',
      });
      expect(over.success).toBe(false);
      if (!over.success) {
        expect(over.error.issues[0]?.message).toBe('Delivery days cannot exceed 3,650');
      }

      expect(bidFormSchema.safeParse({ amount: 100, deliveryDays: 0, message: '' }).success).toBe(
        false,
      );
      expect(bidFormSchema.safeParse({ amount: 100, deliveryDays: 3.5, message: '' }).success).toBe(
        false,
      );
    });

    it('enforces message max 5000 characters', () => {
      const over = bidFormSchema.safeParse({
        amount: 100,
        deliveryDays: 5,
        message: 'x'.repeat(5001),
      });
      expect(over.success).toBe(false);
      if (!over.success) {
        expect(over.error.issues[0]?.message).toBe('Message cannot exceed 5000 characters');
      }
    });
  });

  describe('BidForm UI Component', () => {
    it('renders listing expectation and delivery context', () => {
      render(<BidForm listing={mockListing} onSubmit={vi.fn()} />);

      expect(screen.getByText('Listing Expectation')).toBeInTheDocument();
      expect(screen.getByText('$100 – $200')).toBeInTheDocument();
      expect(screen.getByText(/Estimated: 7 days/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /submit bid/i })).toBeInTheDocument();
    });

    it('submits form with correctly converted cents amount', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn().mockResolvedValue(undefined);

      render(<BidForm listing={mockListing} onSubmit={handleSubmit} />);

      const amountInput = screen.getByLabelText(/your bid amount/i);
      const deliveryInput = screen.getByLabelText(/delivery timeline/i);
      const messageInput = screen.getByLabelText(/proposal \/ message/i);

      await user.clear(amountInput);
      await user.type(amountInput, '150.75');

      await user.clear(deliveryInput);
      await user.type(deliveryInput, '6');

      await user.clear(messageInput);
      await user.type(messageInput, 'Experienced with Next.js and high-test applications.');

      await user.click(screen.getByRole('button', { name: /submit bid/i }));

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalledWith({
          amountCents: 15075,
          currency: 'USD',
          deliveryDays: 6,
          message: 'Experienced with Next.js and high-test applications.',
          attachmentIds: [],
        });
      });
    });

    it('renders in edit mode when initialBid is provided', async () => {
      const user = userEvent.setup();
      const handleSubmit = vi.fn().mockResolvedValue(undefined);
      const initialBid = makeBid({
        id: 'bid-edit-1',
        amountCents: 25000,
        deliveryDays: 14,
        message: 'Prior proposal note',
      });

      render(<BidForm listing={mockListing} initialBid={initialBid} onSubmit={handleSubmit} />);

      expect(screen.getByRole('button', { name: /update bid/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/your bid amount/i)).toHaveValue(250);
      expect(screen.getByLabelText(/delivery timeline/i)).toHaveValue(14);
      expect(screen.getByLabelText(/proposal \/ message/i)).toHaveValue('Prior proposal note');

      await user.clear(screen.getByLabelText(/your bid amount/i));
      await user.type(screen.getByLabelText(/your bid amount/i), '300');

      await user.click(screen.getByRole('button', { name: /update bid/i }));

      await waitFor(() => {
        expect(handleSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            amountCents: 30000,
          }),
        );
      });
    });

    it('calls onCancel when Cancel button is clicked', async () => {
      const user = userEvent.setup();
      const handleCancel = vi.fn();

      render(<BidForm listing={mockListing} onSubmit={vi.fn()} onCancel={handleCancel} />);

      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });

    it('shows graceful 409 conflict error when submission rejects with 409', async () => {
      const user = userEvent.setup();
      const conflictError = new ApiError(409, 'Conflict', 'CONFLICT');
      const handleSubmit = vi.fn().mockRejectedValue(conflictError);

      render(<BidForm listing={mockListing} onSubmit={handleSubmit} />);

      await user.type(screen.getByLabelText(/your bid amount/i), '100');
      await user.type(screen.getByLabelText(/delivery timeline/i), '5');
      await user.click(screen.getByRole('button', { name: /submit bid/i }));

      await waitFor(() => {
        expect(
          screen.getByText('This bid changed or the listing is no longer open. Please refresh.'),
        ).toBeInTheDocument();
      });
    });

    it('shows general server error message when submission rejects', async () => {
      const user = userEvent.setup();
      const generalError = new Error('Database connection failed');
      const handleSubmit = vi.fn().mockRejectedValue(generalError);

      render(<BidForm listing={mockListing} onSubmit={handleSubmit} />);

      await user.type(screen.getByLabelText(/your bid amount/i), '100');
      await user.type(screen.getByLabelText(/delivery timeline/i), '5');
      await user.click(screen.getByRole('button', { name: /submit bid/i }));

      await waitFor(() => {
        expect(screen.getByText('Database connection failed')).toBeInTheDocument();
      });
    });
  });
});
