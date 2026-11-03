import { describe, it, expect } from 'vitest';
import {
  canBidTransition,
  bidCreateSchema,
  bidCounterSchema,
  bidRejectSchema,
  bidSortSchema,
  bidQuerySchema,
  myBidsQuerySchema,
  type BidAction,
  type BidActorRole,
  type BidStatus,
} from './bid-types';

describe('Bid State Machine Transition Matrix (Table-Driven)', () => {
  const allStatuses: BidStatus[] = [
    'PENDING',
    'SHORTLISTED',
    'COUNTERED',
    'ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
    'DECLINED',
  ];

  const allActions: BidAction[] = [
    'EDIT',
    'WITHDRAW',
    'SHORTLIST',
    'REJECT',
    'COUNTER',
    'ACCEPT',
    'ACCEPT_COUNTER',
  ];

  type ExpectedTransitions = Record<
    BidAction,
    {
      allowedRole: BidActorRole;
      allowedFrom: BidStatus[];
    }
  >;

  const expectedRules: ExpectedTransitions = {
    EDIT: {
      allowedRole: 'bidder',
      allowedFrom: ['PENDING', 'SHORTLISTED', 'COUNTERED'],
    },
    WITHDRAW: {
      allowedRole: 'bidder',
      allowedFrom: ['PENDING', 'SHORTLISTED', 'COUNTERED'],
    },
    SHORTLIST: {
      allowedRole: 'owner',
      allowedFrom: ['PENDING', 'COUNTERED'],
    },
    REJECT: {
      allowedRole: 'owner',
      allowedFrom: ['PENDING', 'SHORTLISTED', 'COUNTERED'],
    },
    COUNTER: {
      allowedRole: 'owner',
      allowedFrom: ['PENDING', 'SHORTLISTED', 'COUNTERED'],
    },
    ACCEPT: {
      allowedRole: 'owner',
      allowedFrom: ['PENDING', 'SHORTLISTED', 'COUNTERED'],
    },
    ACCEPT_COUNTER: {
      allowedRole: 'bidder',
      allowedFrom: ['COUNTERED'],
    },
  };

  for (const action of allActions) {
    const rule = expectedRules[action];

    describe(`Action: ${action}`, () => {
      for (const role of ['owner', 'bidder'] as const) {
        for (const fromStatus of allStatuses) {
          const isAllowedRole = role === rule.allowedRole;
          const isAllowedStatus = rule.allowedFrom.includes(fromStatus);
          const expectedValid = isAllowedRole && isAllowedStatus;

          it(`from ${fromStatus} by ${role} should be ${expectedValid ? 'VALID' : 'INVALID'}`, () => {
            const result = canBidTransition(fromStatus, action, role);
            expect(result).toBe(expectedValid);
          });
        }
      }
    });
  }
});

describe('Bid Schemas Validation', () => {
  it('validates bidCreateSchema', () => {
    const valid = {
      amountCents: 5000,
      currency: 'USD',
      deliveryDays: 7,
      message: 'Will complete successfully',
    };
    expect(bidCreateSchema.safeParse(valid).success).toBe(true);

    // Negative amount rejected
    expect(bidCreateSchema.safeParse({ ...valid, amountCents: -10 }).success).toBe(false);

    // Amount over int4 cap rejected
    expect(bidCreateSchema.safeParse({ ...valid, amountCents: 2147483648 }).success).toBe(false);

    // Delivery days over 3650 rejected
    expect(bidCreateSchema.safeParse({ ...valid, deliveryDays: 3651 }).success).toBe(false);

    // Delivery days non-positive rejected
    expect(bidCreateSchema.safeParse({ ...valid, deliveryDays: 0 }).success).toBe(false);

    // Message over 5000 chars rejected
    expect(bidCreateSchema.safeParse({ ...valid, message: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('validates bidCounterSchema', () => {
    const valid = {
      amountCents: 4500,
      deliveryDays: 5,
      message: 'Can we do 5 days instead?',
    };
    expect(bidCounterSchema.safeParse(valid).success).toBe(true);

    expect(bidCounterSchema.safeParse({ ...valid, amountCents: 2147483648 }).success).toBe(false);
    expect(bidCounterSchema.safeParse({ ...valid, deliveryDays: 3651 }).success).toBe(false);
  });

  it('validates bidRejectSchema', () => {
    expect(bidRejectSchema.safeParse({}).success).toBe(true);
    expect(bidRejectSchema.safeParse({ reason: 'Out of scope' }).success).toBe(true);
    expect(bidRejectSchema.safeParse({ reason: 'a'.repeat(2001) }).success).toBe(false);
  });

  it('normalizes delivery_asc to delivery in bidSortSchema', () => {
    expect(bidSortSchema.parse('delivery_asc')).toBe('delivery');
    expect(bidSortSchema.parse('newest')).toBe('newest');
    expect(bidSortSchema.parse('amount_asc')).toBe('amount_asc');
  });

  it('validates bidQuerySchema and myBidsQuerySchema', () => {
    expect(bidQuerySchema.safeParse({ listingId: 'list-1', sort: 'amount_asc' }).success).toBe(
      true,
    );
    expect(myBidsQuerySchema.safeParse({ status: 'PENDING' }).success).toBe(true);
    expect(myBidsQuerySchema.safeParse({ status: 'INVALID_STATUS' }).success).toBe(false);
  });
});
