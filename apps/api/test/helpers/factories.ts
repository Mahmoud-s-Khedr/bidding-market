import { prisma } from './db.js';
import { conversationKeys } from '../../src/modules/conversations/conversations.keys.js';

export const userInput = (overrides: Partial<{ email: string; displayName: string }> = {}) => ({
  email: `user-${crypto.randomUUID()}@test.local`,
  password: 'Password123!',
  displayName: 'Test User',
  ...overrides,
});

export async function createReview(
  targetId: string,
  authorId: string,
  overrides: { rating?: number; comment?: string; createdAt?: Date } = {},
) {
  const category = await prisma.category.create({
    data: {
      name: `Cat-${crypto.randomUUID()}`,
      slug: `cat-${crypto.randomUUID()}`,
    },
  });
  const listing = await prisma.listing.create({
    data: {
      ownerId: targetId,
      categoryId: category.id,
      kind: 'REQUEST',
      status: 'COMPLETED',
      title: 'Test listing',
      description: 'Test listing description here for testing',
      priceType: 'FIXED',
      priceMinCents: 1000,
      currency: 'USD',
    },
  });
  const bid = await prisma.bid.create({
    data: {
      listingId: listing.id,
      bidderId: authorId,
      amountCents: 1000,
      currency: 'USD',
      deliveryDays: 3,
      message: 'I can do this',
      status: 'ACCEPTED',
    },
  });
  const agreement = await prisma.agreement.create({
    data: {
      listingId: listing.id,
      bidId: bid.id,
      buyerId: targetId,
      providerId: authorId,
      status: 'COMPLETED',
    },
  });
  return prisma.review.create({
    data: {
      agreementId: agreement.id,
      authorId,
      targetId,
      rating: overrides.rating ?? 5,
      comment: overrides.comment ?? 'Great job',
      createdAt: overrides.createdAt,
    },
  });
}

/** Creates the accepted-bid fixture used by agreement integration tests. */
export async function createAgreement({
  buyer,
  provider,
  listing,
  amountCents,
}: {
  buyer: { id: string };
  provider: { id: string };
  listing: { id?: string; kind?: 'REQUEST' | 'OFFER' };
  amountCents: number;
}) {
  const category = await prisma.category.create({
    data: { name: `Cat-${crypto.randomUUID()}`, slug: `cat-${crypto.randomUUID()}` },
  });
  const createdListing = await prisma.listing.create({
    data: {
      id: listing.id,
      ownerId: listing.kind === 'OFFER' ? provider.id : buyer.id,
      categoryId: category.id,
      kind: listing.kind ?? 'REQUEST',
      status: 'IN_PROGRESS',
      title: 'Agreement fixture',
      description: 'Agreement fixture description suitable for tests',
      priceType: 'FIXED',
      priceMinCents: amountCents,
      currency: 'USD',
    },
  });
  const bid = await prisma.bid.create({
    data: {
      listingId: createdListing.id,
      bidderId: listing.kind === 'OFFER' ? buyer.id : provider.id,
      amountCents,
      currency: 'USD',
      deliveryDays: 3,
      message: 'Fixture bid',
      status: 'ACCEPTED',
    },
  });
  const agreement = await prisma.agreement.create({
    data: {
      listingId: createdListing.id,
      bidId: bid.id,
      buyerId: buyer.id,
      providerId: provider.id,
      status: 'ACTIVE',
      events: {
        create: {
          type: 'CREATED',
          data: { initiatorRole: 'buyer', finalAmountCents: amountCents, finalDeliveryDays: 3 },
        },
      },
    },
  });
  await createConversation({
    userAId: buyer.id,
    userBId: provider.id,
    listingId: createdListing.id,
    bidId: bid.id,
    agreementId: agreement.id,
  });
  return { agreement, listing: createdListing, bid };
}

export async function createConversation({
  userAId,
  userBId,
  listingId,
  bidId,
  agreementId,
  lastMessageAt,
}: {
  userAId: string;
  userBId: string;
  listingId?: string | null;
  bidId?: string | null;
  agreementId?: string | null;
  lastMessageAt?: Date;
}) {
  const keys = conversationKeys(userAId, userBId, listingId);
  return prisma.conversation.create({
    data: {
      ...keys,
      listingId: listingId ?? null,
      bidId: bidId ?? null,
      agreementId: agreementId ?? null,
      lastMessageAt: lastMessageAt ?? new Date(),
      participants: { create: [{ userId: userAId }, { userId: userBId }] },
    },
  });
}
