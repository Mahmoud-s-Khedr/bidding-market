import type {
  Attachment,
  Category,
  ListingDetail,
  ListingSummary,
  PublicUser,
  User,
} from '@/lib/api/types';
import type { Conversation, Message, Notification } from '@/lib/api/messaging-types';
import type {
  AgreementDetail,
  AgreementEvent,
  AgreementSummary,
  Bid,
  BidWithListing,
  DashboardSummary,
  DeliverableResponse,
  ListingSummary as SharedListingSummary,
  MilestoneResponse,
  PublicUser as SharedPublicUser,
  ReviewItem,
} from '@market/shared';

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
    bidder: makePublicUser({
      id: 'user-bidder',
      displayName: 'Bidder User',
    }) as unknown as SharedPublicUser,
    amountCents: 15000,
    currency: 'USD',
    deliveryDays: 5,
    message: 'I can deliver this on time.',
    status: 'PENDING',
    rejectReason: null,
    lastCounterById: null,
    attachments: [],
    createdAt: new Date('2026-10-01T12:00:00Z'),
    updatedAt: new Date('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

export function makeBidWithListing(overrides: Partial<BidWithListing> = {}): BidWithListing {
  return {
    ...makeBid(),
    listing: makeListingSummary() as unknown as SharedListingSummary,
    attachments: [],
    ...overrides,
  };
}

export function makeMilestone(overrides: Partial<MilestoneResponse> = {}): MilestoneResponse {
  return {
    id: 'ms-1',
    agreementId: 'agreement-default',
    title: 'Initial Deliverable',
    amountCents: 5000,
    dueDate: new Date('2026-11-01T00:00:00Z'),
    status: 'PENDING',
    position: 0,
    ...overrides,
  };
}

export function makeDeliverable(overrides: Partial<DeliverableResponse> = {}): DeliverableResponse {
  return {
    id: 'deliv-1',
    agreementId: 'agreement-default',
    note: 'Here is the completed work.',
    submittedById: 'user-provider',
    acceptedAt: null,
    revisionNote: null,
    attachments: [makeAttachment({ id: 'deliv-att-1', fileName: 'result.pdf' })],
    createdAt: new Date('2026-10-15T12:00:00Z'),
    ...overrides,
  };
}

export function makeAgreementEvent(overrides: Partial<AgreementEvent> = {}): AgreementEvent {
  return {
    id: 'event-1',
    agreementId: 'agreement-default',
    actorId: 'user-buyer',
    type: 'CREATED',
    data: null,
    createdAt: new Date('2026-10-10T10:00:00Z'),
    ...overrides,
  };
}

export function makeAgreementDetail(overrides: Partial<AgreementDetail> = {}): AgreementDetail {
  const buyer = makePublicUser({
    id: 'user-buyer',
    displayName: 'Buyer User',
  }) as unknown as SharedPublicUser;
  const provider = makePublicUser({
    id: 'user-provider',
    displayName: 'Provider User',
  }) as unknown as SharedPublicUser;
  return {
    id: 'agreement-default',
    listingId: 'listing-default',
    bidId: 'bid-default',
    buyer,
    provider,
    status: 'ACTIVE',
    listing: makeListingSummary({
      id: 'listing-default',
      owner: buyer,
    }) as unknown as SharedListingSummary,
    bid: makeBid({ id: 'bid-default', amountCents: 20000, currency: 'USD', bidder: provider }),
    conversationId: 'conv-default',
    myRole: 'buyer',
    myConfirmation: false,
    milestones: [makeMilestone()],
    deliverables: [makeDeliverable()],
    events: [makeAgreementEvent()],
    createdAt: new Date('2026-10-10T10:00:00Z'),
    updatedAt: new Date('2026-10-10T10:00:00Z'),
    ...overrides,
  };
}

export function makeAgreementSummary(overrides: Partial<AgreementSummary> = {}): AgreementSummary {
  const buyer = makePublicUser({
    id: 'user-buyer',
    displayName: 'Buyer User',
  }) as unknown as SharedPublicUser;
  const provider = makePublicUser({
    id: 'user-provider',
    displayName: 'Provider User',
  }) as unknown as SharedPublicUser;
  return {
    id: 'agreement-default',
    listingId: 'listing-default',
    bidId: 'bid-default',
    buyer,
    provider,
    status: 'ACTIVE',
    listing: makeListingSummary({
      id: 'listing-default',
      owner: buyer,
    }) as unknown as SharedListingSummary,
    bid: makeBid({ id: 'bid-default', amountCents: 20000, currency: 'USD', bidder: provider }),
    conversationId: 'conv-default',
    myRole: 'buyer',
    myConfirmation: false,
    milestones: [makeMilestone()],
    deliverables: [],
    createdAt: new Date('2026-10-10T10:00:00Z'),
    updatedAt: new Date('2026-10-10T10:00:00Z'),
    ...overrides,
  };
}

export function makeDashboardSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    listings: {
      open: 3,
      inProgress: 1,
      completed: 2,
    },
    bids: {
      pending: 4,
      accepted: 2,
    },
    agreements: {
      active: 2,
      completed: 5,
    },
    unreadMessages: 3,
    unreadNotifications: 1,
    ...overrides,
  };
}

export function makeReviewItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'rev-1',
    agreementId: 'agreement-default',
    rating: 5,
    comment: 'Great work, exceeded expectations!',
    author: makePublicUser({
      id: 'user-buyer',
      displayName: 'Buyer User',
    }) as unknown as SharedPublicUser,
    createdAt: new Date('2026-10-20T12:00:00Z'),
    ...overrides,
  };
}
