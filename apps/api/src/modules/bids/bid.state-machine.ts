import { ConflictException } from '@nestjs/common';
import type { BidStatus } from '@market/shared';

export type BidAction =
  'EDIT' | 'WITHDRAW' | 'SHORTLIST' | 'REJECT' | 'COUNTER' | 'ACCEPT' | 'ACCEPT_COUNTER';

export type BidActorRole = 'owner' | 'bidder';

/**
 * Pure transition function enforcing the bidding negotiation state machine.
 * Throws ConflictException (HTTP 409) if the transition is invalid or the actor role is disallowed.
 */
export function assertBidTransition(
  from: BidStatus,
  action: BidAction,
  actorRole: BidActorRole,
): BidStatus {
  if (action === 'EDIT') {
    if (actorRole !== 'bidder') {
      throw new ConflictException('Only the bidder can edit their bid');
    }
    if (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED') {
      return 'PENDING';
    }
    throw new ConflictException(`Cannot edit bid in status ${from}`);
  }

  if (action === 'WITHDRAW') {
    if (actorRole !== 'bidder') {
      throw new ConflictException('Only the bidder can withdraw their bid');
    }
    if (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED') {
      return 'WITHDRAWN';
    }
    throw new ConflictException(`Cannot withdraw bid in status ${from}`);
  }

  if (action === 'SHORTLIST') {
    if (actorRole !== 'owner') {
      throw new ConflictException('Only the listing owner can shortlist a bid');
    }
    if (from === 'PENDING' || from === 'COUNTERED') {
      return 'SHORTLISTED';
    }
    throw new ConflictException(`Cannot shortlist bid in status ${from}`);
  }

  if (action === 'REJECT') {
    if (actorRole !== 'owner') {
      throw new ConflictException('Only the listing owner can reject a bid');
    }
    if (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED') {
      return 'REJECTED';
    }
    throw new ConflictException(`Cannot reject bid in status ${from}`);
  }

  if (action === 'COUNTER') {
    if (actorRole !== 'owner') {
      throw new ConflictException('Only the listing owner can counter a bid');
    }
    if (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED') {
      return 'COUNTERED';
    }
    throw new ConflictException(`Cannot counter bid in status ${from}`);
  }

  if (action === 'ACCEPT') {
    if (actorRole !== 'owner') {
      throw new ConflictException('Only the listing owner can accept a bid');
    }
    if (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED') {
      return 'ACCEPTED';
    }
    throw new ConflictException(`Cannot accept bid in status ${from}`);
  }

  if (action === 'ACCEPT_COUNTER') {
    if (actorRole !== 'bidder') {
      throw new ConflictException('Only the bidder can accept a counter-offer');
    }
    if (from === 'COUNTERED') {
      return 'ACCEPTED';
    }
    throw new ConflictException(`Cannot accept counter-offer when bid is in status ${from}`);
  }

  throw new ConflictException(`Unknown action: ${String(action)}`);
}
