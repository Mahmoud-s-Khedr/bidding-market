import { describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import type { BidStatus } from '@market/shared';
import { assertBidTransition, type BidAction } from './bid.state-machine.js';

describe('assertBidTransition', () => {
  const allStatuses: BidStatus[] = [
    'PENDING',
    'SHORTLISTED',
    'COUNTERED',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
    'DECLINED',
  ];

  describe('EDIT action', () => {
    it('allows bidder to edit PENDING, SHORTLISTED, COUNTERED bids -> PENDING', () => {
      expect(assertBidTransition('PENDING', 'EDIT', 'bidder')).toBe('PENDING');
      expect(assertBidTransition('SHORTLISTED', 'EDIT', 'bidder')).toBe('PENDING');
      expect(assertBidTransition('COUNTERED', 'EDIT', 'bidder')).toBe('PENDING');
    });

    it('rejects bidder editing terminal bids', () => {
      const terminal: BidStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'DECLINED'];
      for (const status of terminal) {
        expect(() => assertBidTransition(status, 'EDIT', 'bidder')).toThrow(ConflictException);
      }
    });

    it('rejects non-bidder (owner) editing any bid', () => {
      for (const status of allStatuses) {
        expect(() => assertBidTransition(status, 'EDIT', 'owner')).toThrow(ConflictException);
      }
    });
  });

  describe('WITHDRAW action', () => {
    it('allows bidder to withdraw PENDING, SHORTLISTED, COUNTERED bids -> WITHDRAWN', () => {
      expect(assertBidTransition('PENDING', 'WITHDRAW', 'bidder')).toBe('WITHDRAWN');
      expect(assertBidTransition('SHORTLISTED', 'WITHDRAW', 'bidder')).toBe('WITHDRAWN');
      expect(assertBidTransition('COUNTERED', 'WITHDRAW', 'bidder')).toBe('WITHDRAWN');
    });

    it('rejects bidder withdrawing terminal bids', () => {
      const terminal: BidStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'DECLINED'];
      for (const status of terminal) {
        expect(() => assertBidTransition(status, 'WITHDRAW', 'bidder')).toThrow(ConflictException);
      }
    });

    it('rejects non-bidder (owner) withdrawing any bid', () => {
      for (const status of allStatuses) {
        expect(() => assertBidTransition(status, 'WITHDRAW', 'owner')).toThrow(ConflictException);
      }
    });
  });

  describe('SHORTLIST action', () => {
    it('allows owner to shortlist PENDING and COUNTERED bids -> SHORTLISTED', () => {
      expect(assertBidTransition('PENDING', 'SHORTLIST', 'owner')).toBe('SHORTLISTED');
      expect(assertBidTransition('COUNTERED', 'SHORTLIST', 'owner')).toBe('SHORTLISTED');
    });

    it('rejects owner shortlisting an already shortlisted or terminal bid', () => {
      const invalid: BidStatus[] = ['SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'DECLINED'];
      for (const status of invalid) {
        expect(() => assertBidTransition(status, 'SHORTLIST', 'owner')).toThrow(ConflictException);
      }
    });

    it('rejects non-owner (bidder) shortlisting any bid', () => {
      for (const status of allStatuses) {
        expect(() => assertBidTransition(status, 'SHORTLIST', 'bidder')).toThrow(ConflictException);
      }
    });
  });

  describe('REJECT action', () => {
    it('allows owner to reject PENDING, SHORTLISTED, COUNTERED bids -> REJECTED', () => {
      expect(assertBidTransition('PENDING', 'REJECT', 'owner')).toBe('REJECTED');
      expect(assertBidTransition('SHORTLISTED', 'REJECT', 'owner')).toBe('REJECTED');
      expect(assertBidTransition('COUNTERED', 'REJECT', 'owner')).toBe('REJECTED');
    });

    it('rejects owner rejecting terminal bids', () => {
      const terminal: BidStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'DECLINED'];
      for (const status of terminal) {
        expect(() => assertBidTransition(status, 'REJECT', 'owner')).toThrow(ConflictException);
      }
    });

    it('rejects non-owner (bidder) rejecting any bid', () => {
      for (const status of allStatuses) {
        expect(() => assertBidTransition(status, 'REJECT', 'bidder')).toThrow(ConflictException);
      }
    });
  });

  describe('COUNTER action', () => {
    it('allows owner to counter PENDING, SHORTLISTED, COUNTERED bids -> COUNTERED', () => {
      expect(assertBidTransition('PENDING', 'COUNTER', 'owner')).toBe('COUNTERED');
      expect(assertBidTransition('SHORTLISTED', 'COUNTER', 'owner')).toBe('COUNTERED');
      expect(assertBidTransition('COUNTERED', 'COUNTER', 'owner')).toBe('COUNTERED');
    });

    it('rejects owner countering terminal bids', () => {
      const terminal: BidStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'DECLINED'];
      for (const status of terminal) {
        expect(() => assertBidTransition(status, 'COUNTER', 'owner')).toThrow(ConflictException);
      }
    });

    it('rejects non-owner (bidder) countering any bid', () => {
      for (const status of allStatuses) {
        expect(() => assertBidTransition(status, 'COUNTER', 'bidder')).toThrow(ConflictException);
      }
    });
  });

  describe('ACCEPT action', () => {
    it('allows owner to accept PENDING, SHORTLISTED, COUNTERED bids -> ACCEPTED', () => {
      expect(assertBidTransition('PENDING', 'ACCEPT', 'owner')).toBe('ACCEPTED');
      expect(assertBidTransition('SHORTLISTED', 'ACCEPT', 'owner')).toBe('ACCEPTED');
      expect(assertBidTransition('COUNTERED', 'ACCEPT', 'owner')).toBe('ACCEPTED');
    });

    it('rejects owner accepting terminal bids', () => {
      const terminal: BidStatus[] = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'DECLINED'];
      for (const status of terminal) {
        expect(() => assertBidTransition(status, 'ACCEPT', 'owner')).toThrow(ConflictException);
      }
    });

    it('rejects non-owner (bidder) directly accepting a bid', () => {
      for (const status of allStatuses) {
        expect(() => assertBidTransition(status, 'ACCEPT', 'bidder')).toThrow(ConflictException);
      }
    });
  });

  describe('ACCEPT_COUNTER action', () => {
    it('allows bidder to accept COUNTERED bid -> ACCEPTED', () => {
      expect(assertBidTransition('COUNTERED', 'ACCEPT_COUNTER', 'bidder')).toBe('ACCEPTED');
    });

    it('rejects bidder accepting counter on non-countered bids', () => {
      const nonCountered: BidStatus[] = [
        'PENDING',
        'SHORTLISTED',
        'ACCEPTED',
        'REJECTED',
        'WITHDRAWN',
        'DECLINED',
      ];
      for (const status of nonCountered) {
        expect(() => assertBidTransition(status, 'ACCEPT_COUNTER', 'bidder')).toThrow(
          ConflictException,
        );
      }
    });

    it('rejects non-bidder (owner) accepting counter', () => {
      for (const status of allStatuses) {
        expect(() => assertBidTransition(status, 'ACCEPT_COUNTER', 'owner')).toThrow(
          ConflictException,
        );
      }
    });
  });

  describe('Unknown actions', () => {
    it('throws ConflictException on unknown action', () => {
      expect(() => assertBidTransition('PENDING', 'INVALID_ACTION' as BidAction, 'bidder')).toThrow(
        ConflictException,
      );
    });
  });
});
