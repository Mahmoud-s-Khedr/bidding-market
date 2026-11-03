import type { BidStatus } from '@market/shared';

export type BidAction =
  'EDIT' | 'WITHDRAW' | 'SHORTLIST' | 'REJECT' | 'COUNTER' | 'ACCEPT' | 'ACCEPT_COUNTER';

export type BidActorRole = 'owner' | 'bidder';

/**
 * Client validation for bid state transitions.
 * Mirror and client-side guard for the canonical server state machine in:
 * `apps/api/src/modules/bids/bid.state-machine.ts`
 */
export function canBidTransition(
  from: BidStatus,
  action: BidAction,
  actorRole: BidActorRole,
): boolean {
  if (action === 'EDIT') {
    return (
      actorRole === 'bidder' &&
      (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED')
    );
  }
  if (action === 'WITHDRAW') {
    return (
      actorRole === 'bidder' &&
      (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED')
    );
  }
  if (action === 'SHORTLIST') {
    return actorRole === 'owner' && (from === 'PENDING' || from === 'COUNTERED');
  }
  if (action === 'REJECT') {
    return (
      actorRole === 'owner' &&
      (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED')
    );
  }
  if (action === 'COUNTER') {
    return (
      actorRole === 'owner' &&
      (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED')
    );
  }
  if (action === 'ACCEPT') {
    return (
      actorRole === 'owner' &&
      (from === 'PENDING' || from === 'SHORTLISTED' || from === 'COUNTERED')
    );
  }
  if (action === 'ACCEPT_COUNTER') {
    return actorRole === 'bidder' && from === 'COUNTERED';
  }
  return false;
}
