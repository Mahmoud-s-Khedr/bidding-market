import type {
  Attachment,
  Category,
  ListingDetail,
  ListingSummary,
  PublicUser,
} from '@/lib/api/types';

export function makePublicUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'user-default',
    displayName: 'Default User',
    avatarUrl: null,
    bio: null,
    location: null,
    isBusiness: false,
    companyName: null,
    ratingAvg: 5.0,
    ratingCount: 0,
    completedCount: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-default',
    name: 'Default Category',
    slug: 'default-category',
    parentId: null,
    description: null,
    listingCount: 0,
    children: [],
    ...overrides,
  };
}

export function makeListingSummary(overrides: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: 'listing-default',
    title: 'Default Listing Title',
    kind: 'REQUEST',
    status: 'OPEN',
    priceType: 'FIXED',
    priceMinCents: 10000,
    priceMaxCents: null,
    currency: 'USD',
    location: 'Remote',
    categoryId: 'cat-default',
    categoryName: 'Default Category',
    thumbnailUrl: null,
    owner: makePublicUser(),
    bidCount: 0,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    expiresAt: null,
    ...overrides,
  };
}

export function makeListingDetail(overrides: Partial<ListingDetail> = {}): ListingDetail {
  const base = makeListingSummary();
  return {
    ...base,
    description: 'Default listing description with more than twenty characters.',
    deliveryDays: 7,
    tags: ['general'],
    images: [],
    attachments: [],
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    category: {
      id: base.categoryId,
      name: base.categoryName,
      slug: 'default-category',
      parentId: null,
    },
    myBid: null,
    ...overrides,
  };
}

export function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-default',
    key: 'listing_attachment/user/att-default/file.pdf',
    fileName: 'file.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    url: 'https://cdn.example.com/file.pdf',
    ...overrides,
  };
}
