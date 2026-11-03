import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/auth.js';
import { BidsController, ListingBidsController } from './bids.controller.js';

describe('BidsControllers', () => {
  const user: AuthUser = { id: 'u1', role: 'USER' };

  describe('ListingBidsController', () => {
    it('delegates create and findByListing', async () => {
      const mockService = {
        create: vi.fn().mockResolvedValue({ id: 'b1' }),
        findByListing: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      };

      const c = new ListingBidsController(mockService as never);

      await c.create(
        user,
        { id: 'l1' },
        {
          amountCents: 5000,
          currency: 'USD',
          deliveryDays: 3,
          message: 'My bid',
        },
      );
      expect(mockService.create).toHaveBeenCalledWith(
        'l1',
        expect.objectContaining({ amountCents: 5000 }),
        user,
      );

      await c.findByListing(user, { id: 'l1' }, { limit: 10 });
      expect(mockService.findByListing).toHaveBeenCalledWith('l1', { limit: 10 }, user);
    });
  });

  describe('BidsController', () => {
    it('delegates findMine, findById, update, actions and accept', async () => {
      const mockService = {
        findMine: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
        findById: vi.fn().mockResolvedValue({ id: 'b1' }),
        update: vi.fn().mockResolvedValue({ id: 'b1' }),
        withdraw: vi.fn().mockResolvedValue({ id: 'b1', status: 'WITHDRAWN' }),
        shortlist: vi.fn().mockResolvedValue({ id: 'b1', status: 'SHORTLISTED' }),
        reject: vi.fn().mockResolvedValue({ id: 'b1', status: 'REJECTED' }),
        counter: vi.fn().mockResolvedValue({ id: 'b1', status: 'COUNTERED' }),
        acceptCounter: vi.fn().mockResolvedValue({ bid: { id: 'b1' }, agreement: { id: 'ag1' } }),
        accept: vi.fn().mockResolvedValue({ bid: { id: 'b1' }, agreement: { id: 'ag1' } }),
      };

      const c = new BidsController(mockService as never);

      await c.findMine(user, { limit: 5 });
      expect(mockService.findMine).toHaveBeenCalledWith({ limit: 5 }, user);

      await c.findById(user, { id: 'b1' });
      expect(mockService.findById).toHaveBeenCalledWith('b1', user);

      await c.update(user, { id: 'b1' }, { amountCents: 6000 });
      expect(mockService.update).toHaveBeenCalledWith('b1', { amountCents: 6000 }, user);

      await c.withdraw(user, { id: 'b1' });
      expect(mockService.withdraw).toHaveBeenCalledWith('b1', user);

      await c.shortlist(user, { id: 'b1' });
      expect(mockService.shortlist).toHaveBeenCalledWith('b1', user);

      await c.reject(user, { id: 'b1' }, { reason: 'No' });
      expect(mockService.reject).toHaveBeenCalledWith('b1', { reason: 'No' }, user);

      await c.counter(user, { id: 'b1' }, { amountCents: 4500, deliveryDays: 2, message: 'Deal?' });
      expect(mockService.counter).toHaveBeenCalledWith(
        'b1',
        { amountCents: 4500, deliveryDays: 2, message: 'Deal?' },
        user,
      );

      await c.acceptCounter(user, { id: 'b1' });
      expect(mockService.acceptCounter).toHaveBeenCalledWith('b1', user);

      await c.accept(user, { id: 'b1' });
      expect(mockService.accept).toHaveBeenCalledWith('b1', user);
    });
  });
});
