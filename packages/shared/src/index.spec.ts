import { describe, expect, it } from 'vitest';
import {
  attachmentSchema,
  bidAcceptResponseSchema,
  bidCounterSchema,
  bidCreateSchema,
  bidDetailSchema,
  bidQuerySchema,
  bidRejectSchema,
  bidRevisionSchema,
  bidUpdateSchema,
  bidWithListingSchema,
  categoryCreateSchema,
  categoryTreeNodeSchema,
  categoryUpdateSchema,
  listingCreateSchema,
  listingDetailSchema,
  listingQuerySchema,
  listingSummarySchema,
  listingUpdateSchema,
  loginSchema,
  MAX_INT4,
  messageCreateSchema,
  milestoneSchema,
  passwordSchema,
  presignUploadSchema,
  registerSchema,
  updateProfileSchema,
  uploadPresignResponseSchema,
} from './index.js';
describe('shared schemas', () => {
  it('enforces password strength', () => {
    expect(passwordSchema.safeParse('alllowercase1').success).toBe(false);
    expect(passwordSchema.safeParse('GoodPassword1').success).toBe(true);
  });
  it('rejects inverted price ranges', () => {
    expect(
      listingCreateSchema.safeParse({
        kind: 'REQUEST',
        title: 'A valid title',
        description: 'A sufficiently detailed listing description',
        categoryId: 'c',
        priceType: 'RANGE',
        priceMinCents: 20,
        priceMaxCents: 10,
      }).success,
    ).toBe(false);
  });
  it('validates FIXED price rules', () => {
    const base = {
      kind: 'REQUEST',
      title: 'A valid title',
      description: 'A sufficiently detailed listing description',
      categoryId: 'c',
      priceType: 'FIXED',
    };
    expect(listingCreateSchema.safeParse(base).success).toBe(false);
    expect(listingCreateSchema.safeParse({ ...base, priceMinCents: 1000 }).success).toBe(true);
    expect(
      listingCreateSchema.safeParse({ ...base, priceMinCents: 1000, priceMaxCents: 2000 }).success,
    ).toBe(false);
  });
  it('validates NEGOTIABLE price rules', () => {
    const base = {
      kind: 'OFFER',
      title: 'A valid title',
      description: 'A sufficiently detailed listing description',
      categoryId: 'c',
      priceType: 'NEGOTIABLE',
    };
    expect(listingCreateSchema.safeParse(base).success).toBe(true);
    expect(listingCreateSchema.safeParse({ ...base, priceMinCents: 100 }).success).toBe(false);
    expect(listingCreateSchema.safeParse({ ...base, priceMaxCents: 100 }).success).toBe(false);
  });
  it('validates listingUpdateSchema', () => {
    expect(listingUpdateSchema.safeParse({ title: 'New title' }).success).toBe(true);
    expect(listingUpdateSchema.safeParse({ priceMinCents: 20, priceMaxCents: 10 }).success).toBe(
      false,
    );
    expect(listingUpdateSchema.safeParse({ priceMinCents: 10, priceMaxCents: 20 }).success).toBe(
      true,
    );
  });
  it('validates category schemas', () => {
    expect(categoryCreateSchema.safeParse({ name: 'Tech', slug: 'tech' }).success).toBe(true);
    expect(categoryCreateSchema.safeParse({ name: '', slug: 'tech' }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: 'Tech', slug: 'Tech Invalid' }).success).toBe(
      false,
    );
    expect(categoryUpdateSchema.safeParse({ name: 'New Tech' }).success).toBe(true);
    const tree = {
      id: 'c1',
      name: 'Tech',
      slug: 'tech',
      parentId: null,
      description: 'Tech desc',
      listingCount: 3,
      children: [
        {
          id: 'c2',
          name: 'Web Dev',
          slug: 'web-dev',
          parentId: 'c1',
          description: null,
          listingCount: 2,
          children: [],
        },
      ],
    };
    expect(categoryTreeNodeSchema.safeParse(tree).success).toBe(true);
  });
  it('validates attachment and presign response schemas', () => {
    const attachment = {
      id: 'a1',
      key: 'k1',
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
    };
    expect(attachmentSchema.safeParse(attachment).success).toBe(true);
    expect(attachmentSchema.safeParse({ ...attachment, url: 'https://example.com' }).success).toBe(
      true,
    );
    expect(
      uploadPresignResponseSchema.safeParse({
        uploadId: 'u1',
        url: 'https://put-url',
        headers: { 'content-type': 'application/pdf' },
        key: 'k1',
        expiresAt: new Date().toISOString(),
      }).success,
    ).toBe(true);
  });
  it('validates listingDetailSchema with category and myBid', () => {
    const detail = {
      id: 'l1',
      owner: {
        id: 'u1',
        displayName: 'Alice',
        avatarUrl: null,
        bio: null,
        location: null,
        isBusiness: false,
        companyName: null,
        ratingAvg: 0,
        ratingCount: 0,
        completedCount: 0,
        createdAt: new Date(),
      },
      categoryId: 'c1',
      categoryName: 'Tech',
      thumbnailUrl: 'https://s3/thumb.png',
      kind: 'REQUEST',
      status: 'OPEN',
      title: 'Valid title',
      priceType: 'FIXED',
      priceMinCents: 100,
      priceMaxCents: null,
      currency: 'USD',
      location: null,
      expiresAt: null,
      bidCount: 0,
      createdAt: new Date(),
      description: 'A valid description that is sufficiently detailed',
      deliveryDays: 5,
      tags: ['tag1'],
      images: [],
      attachments: [],
      updatedAt: new Date(),
      category: { id: 'c1', name: 'Tech', slug: 'tech', parentId: null },
      myBid: null,
    };
    expect(listingDetailSchema.safeParse(detail).success).toBe(true);
  });
  it('validates listingSummarySchema with categoryName and thumbnailUrl', () => {
    const summary = {
      id: 'l1',
      owner: {
        id: 'u1',
        displayName: 'Alice',
        avatarUrl: null,
        bio: null,
        location: null,
        isBusiness: false,
        companyName: null,
        ratingAvg: 0,
        ratingCount: 0,
        completedCount: 0,
        createdAt: new Date(),
      },
      categoryId: 'c1',
      categoryName: 'Tech',
      thumbnailUrl: null,
      kind: 'REQUEST',
      status: 'OPEN',
      title: 'Valid title',
      priceType: 'FIXED',
      priceMinCents: 100,
      priceMaxCents: null,
      currency: 'USD',
      location: null,
      expiresAt: null,
      bidCount: 0,
      createdAt: new Date(),
    };
    expect(listingSummarySchema.safeParse(summary).success).toBe(true);
  });
  it('validates updateProfileSchema with avatarUploadId', () => {
    expect(updateProfileSchema.safeParse({ avatarUploadId: 'upload_123' }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ avatarUploadId: null }).success).toBe(true);
    expect(updateProfileSchema.safeParse({ avatarUploadId: '' }).success).toBe(false);
  });
  it('validates bid schemas, sort transforms, and revisions', () => {
    expect(
      bidCreateSchema.safeParse({
        amountCents: 5000,
        currency: 'USD',
        deliveryDays: 3,
        message: 'I can deliver this',
      }).success,
    ).toBe(true);
    expect(
      bidCreateSchema.safeParse({
        amountCents: -1,
        deliveryDays: 0,
        message: 'invalid',
      }).success,
    ).toBe(false);

    expect(bidUpdateSchema.safeParse({ amountCents: 6000 }).success).toBe(true);
    expect(
      bidCounterSchema.safeParse({
        amountCents: 4500,
        deliveryDays: 2,
        message: 'Counter offer',
      }).success,
    ).toBe(true);
    expect(bidRejectSchema.safeParse({ reason: 'Too expensive' }).success).toBe(true);

    const parsedQuery = bidQuerySchema.parse({ sort: 'delivery_asc' });
    expect(parsedQuery.sort).toBe('delivery');
    expect(bidQuerySchema.parse({ sort: 'rating' }).sort).toBe('rating');
    expect(bidQuerySchema.parse({ sort: 'amount_desc' }).sort).toBe('amount_desc');
    expect(bidQuerySchema.safeParse({ sort: 'invalid' }).success).toBe(false);

    const user = {
      id: 'u1',
      displayName: 'Alice',
      avatarUrl: null,
      bio: null,
      location: null,
      isBusiness: false,
      companyName: null,
      ratingAvg: 4.8,
      ratingCount: 12,
      completedCount: 10,
      createdAt: new Date(),
    };
    const revision = {
      id: 'rev1',
      bidId: 'b1',
      authorId: 'u1',
      author: user,
      amountCents: 5000,
      deliveryDays: 3,
      message: 'Initial bid',
      createdAt: new Date(),
    };
    expect(bidRevisionSchema.safeParse(revision).success).toBe(true);

    const bid = {
      id: 'b1',
      listingId: 'l1',
      bidder: user,
      amountCents: 5000,
      currency: 'USD',
      deliveryDays: 3,
      message: 'Initial bid',
      status: 'PENDING' as const,
      rejectReason: null,
      lastCounterById: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(
      bidDetailSchema.safeParse({
        ...bid,
        attachments: [],
        revisions: [revision],
      }).success,
    ).toBe(true);

    const listingSummary = {
      id: 'l1',
      owner: user,
      categoryId: 'cat1',
      categoryName: 'Plumbing',
      thumbnailUrl: null,
      kind: 'REQUEST' as const,
      status: 'OPEN' as const,
      title: 'Fix kitchen sink',
      priceType: 'FIXED' as const,
      priceMinCents: 5000,
      priceMaxCents: null,
      currency: 'USD',
      location: null,
      expiresAt: null,
      bidCount: 1,
      createdAt: new Date(),
    };
    expect(
      bidWithListingSchema.safeParse({
        ...bid,
        listing: listingSummary,
        attachments: [],
      }).success,
    ).toBe(true);

    const agreement = {
      id: 'ag1',
      listingId: 'l1',
      bidId: 'b1',
      buyer: user,
      provider: user,
      status: 'ACTIVE' as const,
      milestones: [],
      deliverables: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(
      bidAcceptResponseSchema.safeParse({
        bid,
        agreement,
      }).success,
    ).toBe(true);
  });
});
describe('schema refinements', () => {
  it('normalizes email and validates business name', () => {
    expect(
      registerSchema.parse({
        email: 'A@EXAMPLE.COM',
        password: 'Password1',
        displayName: 'AB',
        isBusiness: false,
      }).email,
    ).toBe('a@example.com');
    expect(
      registerSchema.safeParse({
        email: 'a@b.com',
        password: 'Password1',
        displayName: 'AB',
        isBusiness: true,
      }).success,
    ).toBe(false);
    expect(loginSchema.parse({ email: 'A@B.COM', password: 'x' }).email).toBe('a@b.com');
  });
  it('covers range, query and message refinements', () => {
    const base = {
      kind: 'REQUEST',
      title: 'Valid title',
      description: 'valid description that is long enough',
      categoryId: 'c',
      priceType: 'RANGE',
      priceMinCents: 1,
      priceMaxCents: 2,
    };
    expect(listingCreateSchema.safeParse({ ...base, priceMaxCents: 0 }).success).toBe(false);
    expect(listingCreateSchema.safeParse({ ...base, priceMinCents: undefined }).success).toBe(
      false,
    );
    expect(listingQuerySchema.safeParse({ minPrice: 2, maxPrice: 1 }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ type: 'TEXT' }).success).toBe(false);
    expect(messageCreateSchema.safeParse({ type: 'TEXT', body: 'yes' }).success).toBe(true);
  });
});
it('enforces upload purpose limits', () => {
  expect(
    presignUploadSchema.safeParse({
      purpose: 'AVATAR',
      fileName: 'a',
      mimeType: 'application/pdf',
      sizeBytes: 1,
    }).success,
  ).toBe(false);
  expect(
    presignUploadSchema.safeParse({
      purpose: 'AVATAR',
      fileName: 'a',
      mimeType: 'image/png',
      sizeBytes: 10_000_001,
    }).success,
  ).toBe(false);
  expect(
    presignUploadSchema.safeParse({
      purpose: 'AVATAR',
      fileName: 'a',
      mimeType: 'image/png',
      sizeBytes: 1,
    }).success,
  ).toBe(true);
});

it('validates paginated and category tree schemas', async () => {
  const { paginated, categoryTreeSchema } = await import('./index.js');
  const p = paginated(categoryTreeSchema);
  expect(
    p.safeParse({
      items: [
        {
          id: '1',
          name: 'Tech',
          slug: 'tech',
          parentId: null,
          description: null,
          listingCount: 0,
          children: [],
        },
      ],
      nextCursor: null,
    }).success,
  ).toBe(true);
});

describe('int4 overflow protection', () => {
  it('exports MAX_INT4 as 2147483647', () => {
    expect(MAX_INT4).toBe(2147483647);
  });

  it('caps listingCreateSchema priceMinCents and priceMaxCents at MAX_INT4', () => {
    const base = {
      kind: 'REQUEST',
      title: 'Valid title for listing',
      description: 'A sufficiently detailed description that satisfies requirements.',
      categoryId: 'c-1',
      priceType: 'FIXED',
    };

    expect(listingCreateSchema.safeParse({ ...base, priceMinCents: 2147483647 }).success).toBe(
      true,
    );
    expect(listingCreateSchema.safeParse({ ...base, priceMinCents: 2147483648 }).success).toBe(
      false,
    );
    expect(listingCreateSchema.safeParse({ ...base, priceMinCents: 99999999999 }).success).toBe(
      false,
    );

    const rangeBase = { ...base, priceType: 'RANGE', priceMinCents: 1000 };
    expect(listingCreateSchema.safeParse({ ...rangeBase, priceMaxCents: 2147483647 }).success).toBe(
      true,
    );
    expect(listingCreateSchema.safeParse({ ...rangeBase, priceMaxCents: 2147483648 }).success).toBe(
      false,
    );
  });

  it('caps listingUpdateSchema priceMinCents and priceMaxCents at MAX_INT4', () => {
    expect(listingUpdateSchema.safeParse({ priceMinCents: 2147483647 }).success).toBe(true);
    expect(listingUpdateSchema.safeParse({ priceMinCents: 2147483648 }).success).toBe(false);
    expect(listingUpdateSchema.safeParse({ priceMaxCents: 2147483647 }).success).toBe(true);
    expect(listingUpdateSchema.safeParse({ priceMaxCents: 2147483648 }).success).toBe(false);
  });

  it('caps listingQuerySchema minPrice and maxPrice at MAX_INT4', () => {
    expect(listingQuerySchema.safeParse({ minPrice: '2147483647' }).success).toBe(true);
    expect(listingQuerySchema.safeParse({ minPrice: '2147483648' }).success).toBe(false);
    expect(listingQuerySchema.safeParse({ minPrice: '999999999999' }).success).toBe(false);
    expect(listingQuerySchema.safeParse({ maxPrice: '2147483647' }).success).toBe(true);
    expect(listingQuerySchema.safeParse({ maxPrice: '2147483648' }).success).toBe(false);
  });

  it('caps bid amountCents at MAX_INT4 in create, counter, and milestone schemas', () => {
    const validBid = {
      amountCents: 2147483647,
      deliveryDays: 5,
      message: 'Can complete the work.',
    };
    expect(bidCreateSchema.safeParse(validBid).success).toBe(true);
    expect(bidCreateSchema.safeParse({ ...validBid, amountCents: 2147483648 }).success).toBe(false);

    expect(bidCounterSchema.safeParse(validBid).success).toBe(true);
    expect(bidCounterSchema.safeParse({ ...validBid, amountCents: 2147483648 }).success).toBe(
      false,
    );

    expect(milestoneSchema.safeParse({ title: 'Phase 1', amountCents: 2147483647 }).success).toBe(
      true,
    );
    expect(milestoneSchema.safeParse({ title: 'Phase 1', amountCents: 2147483648 }).success).toBe(
      false,
    );
  });
});
