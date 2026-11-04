import { describe, it, expect } from 'vitest';
import type { BidStatus } from '@market/shared';
import { canBidTransition, type BidAction, type BidActorRole } from './bid-transitions';

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
