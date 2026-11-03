import type { Agreement, BidDetail } from '@market/shared';

export const BID_EVENTS = {
  CREATED: 'bid.created',
  UPDATED: 'bid.updated',
  COUNTERED: 'bid.countered',
  ACCEPTED: 'bid.accepted',
  REJECTED: 'bid.rejected',
  WITHDRAWN: 'bid.withdrawn',
} as const;

export class BidCreatedEvent {
  constructor(
    public readonly bid: BidDetail,
    public readonly actorId: string,
  ) {}
}

export class BidUpdatedEvent {
  constructor(
    public readonly bid: BidDetail,
    public readonly actorId: string,
  ) {}
}

export class BidCounteredEvent {
  constructor(
    public readonly bid: BidDetail,
    public readonly actorId: string,
  ) {}
}

export class BidAcceptedEvent {
  constructor(
    public readonly bid: BidDetail,
    public readonly agreement: Agreement,
    public readonly actorId: string,
  ) {}
}

export class BidRejectedEvent {
  constructor(
    public readonly bid: BidDetail,
    public readonly actorId: string,
    public readonly reason?: string | null,
  ) {}
}

export class BidWithdrawnEvent {
  constructor(
    public readonly bid: BidDetail,
    public readonly actorId: string,
  ) {}
}
