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
