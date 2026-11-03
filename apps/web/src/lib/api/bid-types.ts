// TEMP: replace with @market/shared after API-03 merges
import { z } from 'zod';
import {
  publicUserSchema,
  attachmentSchema,
  listingSummarySchema,
  paginationSchema,
  MAX_INT4,
} from '@market/shared';
import type { Attachment, ListingSummary, PublicUser } from './types';

export const BidStatus = z.enum([
  'PENDING',
  'SHORTLISTED',
  'COUNTERED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'DECLINED',
]);
export type BidStatus = z.infer<typeof BidStatus>;

export type BidAction =
  'EDIT' | 'WITHDRAW' | 'SHORTLIST' | 'REJECT' | 'COUNTER' | 'ACCEPT' | 'ACCEPT_COUNTER';

export type BidActorRole = 'owner' | 'bidder';

export const bidCreateSchema = z.object({
  amountCents: z.number().int().positive().max(MAX_INT4),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  deliveryDays: z.number().int().positive().max(3650),
  message: z.string().trim().max(5000),
  attachmentIds: z.array(z.string()).optional(),
});
export type BidCreateInput = z.infer<typeof bidCreateSchema>;

export const bidUpdateSchema = bidCreateSchema.partial();
export type BidUpdateInput = z.infer<typeof bidUpdateSchema>;

export const bidCounterSchema = z.object({
  amountCents: z.number().int().positive().max(MAX_INT4),
  deliveryDays: z.number().int().positive().max(3650),
  message: z.string().max(5000),
});
export type BidCounterInput = z.infer<typeof bidCounterSchema>;

export const bidRejectSchema = z.object({
  reason: z.string().max(2000).optional(),
});
export type BidRejectInput = z.infer<typeof bidRejectSchema>;

export const bidSortSchema = z
  .enum(['newest', 'amount_asc', 'amount_desc', 'delivery', 'delivery_asc', 'rating'])
  .transform((v) => (v === 'delivery_asc' ? 'delivery' : v));
export type BidSort = 'newest' | 'amount_asc' | 'amount_desc' | 'delivery' | 'rating';

export const bidQuerySchema = paginationSchema.extend({
  listingId: z.string().optional(),
  status: BidStatus.optional(),
  sort: bidSortSchema.default('newest'),
});
export type BidQueryInput = z.infer<typeof bidQuerySchema>;

export const myBidsQuerySchema = paginationSchema.extend({
  status: BidStatus.optional(),
});
export type MyBidsQueryInput = z.infer<typeof myBidsQuerySchema>;

const date = z.coerce.date();

export const bidRevisionSchema = z.object({
  id: z.string(),
  bidId: z.string(),
  authorId: z.string(),
  author: publicUserSchema.optional(),
  amountCents: z.number().int(),
  deliveryDays: z.number().int(),
  message: z.string(),
  createdAt: date,
});
export type BidRevision = {
  id: string;
  bidId: string;
  authorId: string;
  author?: PublicUser;
  amountCents: number;
  deliveryDays: number;
  message: string;
  createdAt: Date | string;
};

export const bidSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  bidder: publicUserSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  deliveryDays: z.number().int(),
  message: z.string(),
  status: BidStatus,
  rejectReason: z.string().nullable().optional(),
  lastCounterById: z.string().nullable().optional(),
  attachments: z.array(attachmentSchema).optional(),
  createdAt: date,
  updatedAt: date,
});
export type Bid = {
  id: string;
  listingId: string;
  bidder: PublicUser;
  amountCents: number;
  currency: string;
  deliveryDays: number;
  message: string;
  status: BidStatus;
  rejectReason?: string | null;
  lastCounterById?: string | null;
  attachments?: Attachment[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

export const bidDetailSchema = bidSchema.extend({
  attachments: z.array(attachmentSchema).default([]),
  revisions: z.array(bidRevisionSchema).default([]),
  listing: listingSummarySchema.optional(),
});
export type BidDetail = Bid & {
  attachments: Attachment[];
  revisions: BidRevision[];
  listing?: ListingSummary;
};

export const bidWithListingSchema = bidSchema.extend({
  listing: listingSummarySchema,
  attachments: z.array(attachmentSchema).default([]),
});
export type BidWithListing = Bid & {
  listing: ListingSummary;
  attachments: Attachment[];
};

export const agreementMinimalSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  bidId: z.string(),
  status: z.string(),
  createdAt: date,
  updatedAt: date,
});
export type AgreementMinimal = z.infer<typeof agreementMinimalSchema>;

export const bidAcceptResponseSchema = z.object({
  bid: bidSchema,
  agreement: agreementMinimalSchema,
});
export type BidAcceptResponse = {
  bid: Bid;
  agreement: AgreementMinimal;
};

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
