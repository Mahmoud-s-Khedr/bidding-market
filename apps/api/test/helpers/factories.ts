import { prisma } from './db.js';

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
