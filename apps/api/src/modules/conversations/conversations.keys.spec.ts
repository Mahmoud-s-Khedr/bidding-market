import { describe, expect, it } from 'vitest';
import { conversationKeys, NO_LISTING_DEDUP_KEY } from './conversations.keys.js';

describe('conversationKeys', () => {
  it('builds a sorted participant pair key regardless of parameter order', () => {
    const forward = conversationKeys('user-b', 'user-a');
    const backward = conversationKeys('user-a', 'user-b');
    expect(forward.participantPairKey).toBe('user-a:user-b');
    expect(backward.participantPairKey).toBe('user-a:user-b');
  });

  it('uses the listing ID when provided', () => {
    const keys = conversationKeys('user-a', 'user-b', 'listing-123');
    expect(keys.listingDedupKey).toBe('listing-123');
  });

  it('falls back to NO_LISTING_DEDUP_KEY when listing ID is null or undefined', () => {
    expect(conversationKeys('user-a', 'user-b').listingDedupKey).toBe(NO_LISTING_DEDUP_KEY);
    expect(conversationKeys('user-a', 'user-b', null).listingDedupKey).toBe(NO_LISTING_DEDUP_KEY);
    expect(conversationKeys('user-a', 'user-b', undefined).listingDedupKey).toBe(
      NO_LISTING_DEDUP_KEY,
    );
  });
});
