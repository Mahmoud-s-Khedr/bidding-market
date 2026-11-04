import type {
  Attachment,
  Bid,
  BidDetail,
  BidRevision,
  BidWithListing,
  Category,
  ListingDetail,
  ListingSummary,
  PublicUser,
  User,
} from '@/lib/api/types';
import type { Conversation, Message, Notification } from '@/lib/api/messaging-types';

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-default',
    displayName: 'Default User',
    email: 'user@market.test',
    role: 'USER',
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

export function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-default',
    conversationId: 'conv-default',
    sender: makePublicUser(),
    type: 'TEXT',
    body: 'Hello there!',
    voiceDurationSec: null,
    attachments: [],
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

export function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  const otherUser = makePublicUser({ id: 'user-other', displayName: 'Other User' });
  return {
    id: 'conv-default',
    listingId: 'listing-default',
    bidId: null,
    agreementId: null,
    participants: [makePublicUser(), otherUser],
    otherParticipant: otherUser,
    lastMessage: makeMessage(),
    unreadCount: 0,
    listing: {
      id: 'listing-default',
      title: 'Default Listing',
      status: 'OPEN',
    },
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

export function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-default',
    type: 'MESSAGE_RECEIVED',
    title: 'New Message',
    body: 'You received a new message from Other User',
    link: '/messages/conv-default',
    data: null,
    readAt: null,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

export function makeBid(overrides: Partial<Bid> = {}): Bid {
  return {
    id: 'bid-default',
    listingId: 'listing-default',
    bidder: makePublicUser({ id: 'user-bidder', displayName: 'Bidder User' }),
    amountCents: 15000,
    currency: 'USD',
    deliveryDays: 5,
    message: 'I can deliver this project within schedule and high quality.',
    status: 'PENDING',
    rejectReason: null,
    lastCounterById: null,
    attachments: [],
    createdAt: new Date('2026-10-02T00:00:00Z'),
    updatedAt: new Date('2026-10-02T00:00:00Z'),
    ...overrides,
  };
}

export function makeBidRevision(overrides: Partial<BidRevision> = {}): BidRevision {
  return {
    id: 'rev-default',
    bidId: 'bid-default',
    authorId: 'user-bidder',
    author: makePublicUser({ id: 'user-bidder', displayName: 'Bidder User' }),
    amountCents: 15000,
    deliveryDays: 5,
    message: 'Initial proposal message.',
    createdAt: new Date('2026-10-02T00:00:00Z'),
    ...overrides,
  };
}

export function makeBidDetail(overrides: Partial<BidDetail> = {}): BidDetail {
  const base = makeBid();
  return {
    ...base,
    attachments: [],
    revisions: [
      makeBidRevision({
        bidId: base.id,
        authorId: base.bidder.id,
        amountCents: base.amountCents,
        deliveryDays: base.deliveryDays,
        message: base.message,
      }),
    ],
    listing: makeListingSummary({ id: base.listingId }),
    ...overrides,
  };
}

export function makeBidWithListing(overrides: Partial<BidWithListing> = {}): BidWithListing {
  const base = makeBid();
  return {
    ...base,
    listing: makeListingSummary({ id: base.listingId }),
    attachments: [],
    ...overrides,
  };
}
