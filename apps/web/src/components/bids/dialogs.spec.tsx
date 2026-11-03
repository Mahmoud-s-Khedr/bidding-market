import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CounterDialog } from './counter-dialog';
import { RejectDialog } from './reject-dialog';
import { ApiError } from '@/lib/api/client';
import { makeBid } from '../../../test/fixtures';

describe('CounterDialog and RejectDialog Components', () => {
  const mockBid = makeBid({
    id: 'bid-dialog-1',
    amountCents: 20000,
    deliveryDays: 7,
    currency: 'USD',
  });

  describe('CounterDialog', () => {
    it('submits counter proposal with valid values', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      const onOpenChange = vi.fn();

      render(
        <CounterDialog
          open={true}
          onOpenChange={onOpenChange}
          bid={mockBid}
          onConfirm={onConfirm}
        />,
      );

      const amountInput = screen.getByLabelText(/counter amount/i);
      const deliveryInput = screen.getByLabelText(/delivery \(days\)/i);
      const noteInput = screen.getByLabelText(/message to bidder/i);

      await user.clear(amountInput);
      await user.type(amountInput, '180');

      await user.clear(deliveryInput);
      await user.type(deliveryInput, '5');

      await user.type(noteInput, 'Can you do 5 days?');

      await user.click(screen.getByRole('button', { name: /send counter-offer/i }));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith({
          amountCents: 18000,
          deliveryDays: 5,
          message: 'Can you do 5 days?',
        });
      });
    });

    it('closes on 409 conflict error', async () => {
      const user = userEvent.setup();
      const conflictError = new ApiError(409, 'Conflict', 'CONFLICT');
      const onConfirm = vi.fn().mockRejectedValue(conflictError);
      const onOpenChange = vi.fn();

      render(
        <CounterDialog
          open={true}
          onOpenChange={onOpenChange}
          bid={mockBid}
          onConfirm={onConfirm}
        />,
      );

      await user.type(screen.getByLabelText(/message to bidder/i), 'Test note');
      await user.click(screen.getByRole('button', { name: /send counter-offer/i }));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('RejectDialog', () => {
    it('submits rejection with reason', async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn().mockResolvedValue(undefined);
      const onOpenChange = vi.fn();

      render(<RejectDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />);

      const reasonInput = screen.getByLabelText(/reason for rejection/i);
      await user.type(reasonInput, 'Budget exceeded scope');

      await user.click(screen.getByRole('button', { name: /reject bid/i }));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith('Budget exceeded scope');
      });
    });

    it('closes on 409 conflict error', async () => {
      const user = userEvent.setup();
      const conflictError = new ApiError(409, 'Conflict', 'CONFLICT');
      const onConfirm = vi.fn().mockRejectedValue(conflictError);
      const onOpenChange = vi.fn();

      render(<RejectDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />);

      await user.click(screen.getByRole('button', { name: /reject bid/i }));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalled();
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });
});
