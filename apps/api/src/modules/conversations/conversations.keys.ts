export const NO_LISTING_DEDUP_KEY = '__none__';

export interface ConversationDedupKeys {
  participantPairKey: string;
  listingDedupKey: string;
}

export function conversationKeys(
  userA: string,
  userB: string,
  listingId?: string | null,
): ConversationDedupKeys {
  return {
    participantPairKey: [userA, userB].sort().join(':'),
    listingDedupKey: listingId ?? NO_LISTING_DEDUP_KEY,
  };
}
import type { Prisma } from '../../generated/prisma/client.js';

/** Serializes all get-or-create operations for one participant pair and listing. */
export function lockConversation(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  keys: ConversationDedupKeys,
): Promise<number> {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${keys.participantPairKey}:${keys.listingDedupKey}`}))`;
}
