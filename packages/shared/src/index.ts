import { z } from 'zod';

export const Role = z.enum(['USER', 'ADMIN']);
export const UserStatus = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']);
export const ListingKind = z.enum(['REQUEST', 'OFFER']);
export const ListingStatus = z.enum([
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
  'REMOVED',
]);
export const PriceType = z.enum(['FIXED', 'RANGE', 'NEGOTIABLE']);
export const BidStatus = z.enum([
  'PENDING',
  'SHORTLISTED',
  'COUNTERED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'DECLINED',
]);
export const MessageType = z.enum(['TEXT', 'IMAGE', 'FILE', 'VOICE']);
export const AgreementStatus = z.enum([
  'ACTIVE',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
]);
export const MilestoneStatus = z.enum(['PENDING', 'IN_PROGRESS', 'DONE']);
export const UploadPurpose = z.enum([
  'LISTING_IMAGE',
  'LISTING_ATTACHMENT',
  'BID_ATTACHMENT',
  'MESSAGE_ATTACHMENT',
  'DELIVERABLE',
  'AVATAR',
]);
export const NotificationType = z.enum([
  'BID_RECEIVED',
  'BID_UPDATED',
  'BID_COUNTERED',
  'BID_ACCEPTED',
  'BID_REJECTED',
  'MESSAGE_RECEIVED',
  'DELIVERABLE_SUBMITTED',
  'DELIVERABLE_ACCEPTED',
  'REVISION_REQUESTED',
  'AGREEMENT_COMPLETED',
  'AGREEMENT_CANCELLED',
  'REPORT_RESOLVED',
  'REVIEW_RECEIVED',
]);
export const ReportTargetType = z.enum(['LISTING', 'USER', 'MESSAGE', 'BID', 'AGREEMENT']);
export const ReportReason = z.enum(['SPAM', 'FRAUD', 'INAPPROPRIATE', 'HARASSMENT', 'OTHER']);
export const ReportStatus = z.enum(['OPEN', 'RESOLVED', 'DISMISSED']);

const email = z.email().transform((value) => value.toLowerCase());
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[0-9]/, 'Password must include a number');
export const registerSchema = z
  .object({
    email,
    password: passwordSchema,
    displayName: z.string().trim().min(2).max(80),
    isBusiness: z.boolean().optional(),
    companyName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => !v.isBusiness || !!v.companyName, {
    message: 'companyName is required for businesses',
    path: ['companyName'],
  });
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) });
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  avatarUploadId: z.string().min(1).nullable().optional(),
  isBusiness: z.boolean().optional(),
  companyName: z.string().trim().min(1).max(120).nullable().optional(),
});
export const paginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const idParamSchema = z.object({ id: z.string().min(1) });
export const MAX_INT4 = 2147483647;
export const listingCreateSchema = z
  .object({
    kind: ListingKind,
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(20).max(10000),
    categoryId: z.string().min(1),
    priceType: PriceType,
    priceMinCents: z.number().int().nonnegative().max(MAX_INT4).optional(),
    priceMaxCents: z.number().int().nonnegative().max(MAX_INT4).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('USD'),
    deliveryDays: z.number().int().positive().max(3650).optional(),
    location: z.string().max(120).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    imageIds: z.array(z.string()).optional(),
    attachmentIds: z.array(z.string()).optional(),
    expiresAt: z.iso.datetime().optional(),
    status: z.enum(['DRAFT', 'OPEN']).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.priceType === 'FIXED') {
      if (v.priceMinCents === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Fixed prices require priceMinCents',
          path: ['priceMinCents'],
        });
      }
      if (v.priceMaxCents !== undefined && v.priceMaxCents !== null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Fixed prices must not specify priceMaxCents',
          path: ['priceMaxCents'],
        });
      }
    } else if (v.priceType === 'RANGE') {
      if (v.priceMinCents === undefined || v.priceMaxCents === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Range prices require min and max',
          path: ['priceMinCents'],
        });
      } else if (v.priceMinCents > v.priceMaxCents) {
        ctx.addIssue({
          code: 'custom',
          message: 'priceMinCents must not exceed priceMaxCents',
          path: ['priceMinCents'],
        });
      }
    } else if (v.priceType === 'NEGOTIABLE') {
      if (v.priceMinCents !== undefined || v.priceMaxCents !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'Negotiable prices must not specify priceMinCents or priceMaxCents',
          path: ['priceMinCents'],
        });
      }
    }
  });
export const listingUpdateSchema = z
  .object({
    kind: ListingKind.optional(),
    title: z.string().trim().min(5).max(120).optional(),
    description: z.string().trim().min(20).max(10000).optional(),
    categoryId: z.string().min(1).optional(),
    priceType: PriceType.optional(),
    priceMinCents: z.number().int().nonnegative().max(MAX_INT4).nullable().optional(),
    priceMaxCents: z.number().int().nonnegative().max(MAX_INT4).nullable().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    deliveryDays: z.number().int().positive().max(3650).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    imageIds: z.array(z.string()).optional(),
    attachmentIds: z.array(z.string()).optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
    status: z.enum(['DRAFT', 'OPEN']).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.priceMinCents !== undefined &&
      v.priceMinCents !== null &&
      v.priceMaxCents !== undefined &&
      v.priceMaxCents !== null &&
      v.priceMinCents > v.priceMaxCents
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'priceMinCents must not exceed priceMaxCents',
        path: ['priceMinCents'],
      });
    }
  });
export const listingQuerySchema = paginationSchema
  .extend({
    q: z.string().max(200).optional(),
    kind: ListingKind.optional(),
    categoryId: z.string().optional(),
    categorySlug: z.string().optional(),
    minPrice: z.coerce.number().int().nonnegative().max(MAX_INT4).optional(),
    maxPrice: z.coerce.number().int().nonnegative().max(MAX_INT4).optional(),
    currency: z.string().length(3).optional(),
    location: z.string().max(120).optional(),
    status: ListingStatus.optional(),
    ownerId: z.string().optional(),
    sort: z
      .enum(['newest', 'price_asc', 'price_desc', 'ending_soon', 'most_bids', 'relevance'])
      .default('newest'),
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    message: 'minPrice must not exceed maxPrice',
    path: ['minPrice'],
  });
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
export const messageCreateSchema = z
  .object({
    type: MessageType,
    body: z.string().trim().max(5000).optional(),
    attachmentIds: z.array(z.string()).optional(),
    voiceDurationSec: z.number().int().min(1).max(600).optional(),
  })
  .refine((v) => v.type !== 'TEXT' || !!v.body, {
    message: 'Text messages require body',
    path: ['body'],
  })
  .refine((v) => v.type === 'TEXT' || (v.attachmentIds?.length ?? 0) > 0, {
    message: 'Attachments are required',
    path: ['attachmentIds'],
  })
  .refine((v) => v.type !== 'VOICE' || v.voiceDurationSec !== undefined, {
    message: 'Voice messages require duration',
    path: ['voiceDurationSec'],
  });
export const uploadPresignSchema = z.object({
  purpose: UploadPurpose,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});
export const uploadLimits = {
  LISTING_IMAGE: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeBytes: 10_000_000,
  },
  LISTING_ATTACHMENT: {
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
    ],
    maxSizeBytes: 25_000_000,
  },
  BID_ATTACHMENT: {
    mimeTypes: ['application/pdf', 'text/plain', 'application/zip'],
    maxSizeBytes: 25_000_000,
  },
  MESSAGE_ATTACHMENT: {
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/plain',
      'audio/webm',
      'audio/ogg',
      'audio/mpeg',
      'audio/mp4',
    ],
    maxSizeBytes: 25_000_000,
  },
  DELIVERABLE: {
    mimeTypes: ['application/pdf', 'text/plain', 'application/zip'],
    maxSizeBytes: 25_000_000,
  },
  AVATAR: {
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    maxSizeBytes: 10_000_000,
  },
} as const;
export const presignUploadSchema = uploadPresignSchema.superRefine((value, ctx) => {
  const limits = uploadLimits[value.purpose];
  if (!(limits.mimeTypes as readonly string[]).includes(value.mimeType))
    ctx.addIssue({ code: 'custom', message: 'MIME type is not allowed', path: ['mimeType'] });
  if (value.sizeBytes > limits.maxSizeBytes)
    ctx.addIssue({ code: 'custom', message: 'File is too large', path: ['sizeBytes'] });
});
export const bidUpdateSchema = bidCreateSchema.partial();
export type BidUpdateInput = z.infer<typeof bidUpdateSchema>;
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
export const myBidsQuerySchema = paginationSchema.extend({ status: BidStatus.optional() });
export type MyBidsQueryInput = z.infer<typeof myBidsQuerySchema>;
export const bidCounterSchema = z.object({
  amountCents: z.number().int().positive().max(MAX_INT4),
  deliveryDays: z.number().int().positive().max(3650),
  message: z.string().max(5000),
});
export type BidCounterInput = z.infer<typeof bidCounterSchema>;
export const milestoneCreateSchema = z.object({
  title: z.string().min(1).max(200),
  amountCents: z.number().int().nonnegative().max(MAX_INT4).optional(),
  dueDate: z.iso.datetime().optional(),
});
export type MilestoneCreateInput = z.infer<typeof milestoneCreateSchema>;
export const milestoneSchema = z.object({
  title: z.string().min(1).max(200),
  amountCents: z.number().int().nonnegative().max(MAX_INT4).optional(),
  dueDate: z.iso.datetime().optional(),
  status: MilestoneStatus.optional(),
});
export type MilestoneInput = z.infer<typeof milestoneSchema>;
export const deliverableSchema = z.object({
  note: z.string().max(5000),
  attachmentIds: z.array(z.string()).min(1),
});
export type DeliverableInput = z.infer<typeof deliverableSchema>;
export const revisionRequestSchema = z.object({ note: z.string().min(1).max(5000) });
export const notificationQuerySchema = paginationSchema.extend({
  unread: z.coerce.boolean().optional(),
});
export const agreementsQuerySchema = paginationSchema.extend({
  status: AgreementStatus.optional(),
  role: z.enum(['buyer', 'provider']).optional(),
});
export const adminReportsQuerySchema = paginationSchema.extend({ status: ReportStatus.optional() });
export const adminUsersQuerySchema = paginationSchema.extend({
  q: z.string().optional(),
  role: Role.optional(),
  status: UserStatus.optional(),
});
export const adminUserUpdateSchema = z.object({
  role: Role.optional(),
  status: UserStatus.optional(),
  reason: z.string().max(2000).optional(),
});
export const adminResolveReportSchema = z.object({
  action: z.enum(['DISMISS', 'REMOVE_CONTENT', 'SUSPEND_USER']),
  note: z.string().min(1).max(2000),
});
export const conversationCreateSchema = z.object({
  recipientId: z.string().min(1),
  listingId: z.string().optional(),
  bidId: z.string().optional(),
});
export const messagesQuerySchema = paginationSchema;
export const readSchema = z.object({ lastMessageId: z.string() });
export const agreementCancelSchema = z.object({ reason: z.string().min(1).max(2000) });
export const bidRejectSchema = z.object({ reason: z.string().max(2000).optional() });
export type BidRejectInput = z.infer<typeof bidRejectSchema>;
export const acceptCounterSchema = z.object({});
export const milestoneUpdateSchema = milestoneSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
export type MilestoneUpdateInput = z.infer<typeof milestoneUpdateSchema>;
export const disputeSchema = agreementCancelSchema;
export const adminListingActionSchema = z.object({ reason: z.string().min(1).max(2000) });
export const adminListingsQuerySchema = paginationSchema.extend({
  q: z.string().optional(),
  status: ListingStatus.optional(),
});
export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
export const publicUserSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  isBusiness: z.boolean(),
  companyName: z.string().nullable(),
  ratingAvg: z.number(),
  ratingCount: z.number(),
  completedCount: z.number(),
  createdAt: z.coerce.date(),
});
export const privateUserSchema = publicUserSchema.extend({ email: z.email(), role: Role });
export type PublicUser = z.infer<typeof publicUserSchema>;
export type PrivateUser = z.infer<typeof privateUserSchema>;
const date = z.coerce.date();
export const attachmentSchema = z.object({
  id: z.string(),
  key: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  url: z.string().optional(),
});
export type Attachment = z.infer<typeof attachmentSchema>;
export const uploadSchema = attachmentSchema.extend({
  purpose: UploadPurpose,
  status: z.enum(['PENDING', 'READY', 'FAILED']),
  createdAt: date,
  completedAt: date.nullable(),
});
export const uploadPresignResponseSchema = z.object({
  uploadId: z.string(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  key: z.string(),
  expiresAt: z.string(),
});
export type UploadPresignResponse = z.infer<typeof uploadPresignResponseSchema>;
export const categorySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parentId: z.string().nullable().optional(),
});
export type CategorySummary = z.infer<typeof categorySummarySchema>;
export const listingSummarySchema = z.object({
  id: z.string(),
  owner: publicUserSchema,
  categoryId: z.string(),
  categoryName: z.string(),
  thumbnailUrl: z.string().nullable(),
  kind: ListingKind,
  status: ListingStatus,
  title: z.string(),
  priceType: PriceType,
  priceMinCents: z.number().int().nullable(),
  priceMaxCents: z.number().int().nullable(),
  currency: z.string(),
  location: z.string().nullable(),
  expiresAt: date.nullable(),
  bidCount: z.number().int().nonnegative(),
  createdAt: date,
});
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
export type BidRevision = z.infer<typeof bidRevisionSchema>;

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

export const bidDetailSchema = bidSchema.extend({
  attachments: z.array(attachmentSchema).default([]),
  revisions: z.array(bidRevisionSchema).default([]),
  listing: listingSummarySchema.optional(),
});
export type BidDetail = z.infer<typeof bidDetailSchema>;

export const bidWithListingSchema = bidSchema.extend({
  listing: listingSummarySchema,
  attachments: z.array(attachmentSchema).default([]),
});
export type BidWithListing = z.infer<typeof bidWithListingSchema>;
export const listingDetailSchema = listingSummarySchema.extend({
  description: z.string(),
  deliveryDays: z.number().int().nullable(),
  tags: z.array(z.string()),
  images: z.array(attachmentSchema),
  attachments: z.array(attachmentSchema),
  updatedAt: date,
  category: categorySummarySchema,
  myBid: bidSchema.nullable().optional(),
});
export const milestoneResponseSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  title: z.string(),
  amountCents: z.number().int().nullable(),
  dueDate: date.nullable(),
  status: MilestoneStatus,
  position: z.number().int(),
});
export const deliverableResponseSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  note: z.string(),
  submittedById: z.string(),
  acceptedAt: date.nullable(),
  revisionNote: z.string().nullable(),
  attachments: z.array(attachmentSchema),
  createdAt: date,
});
export const deliverableSummarySchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  note: z.string(),
  submittedById: z.string(),
  acceptedAt: date.nullable(),
  revisionNote: z.string().nullable(),
  createdAt: date,
});
export const agreementEventSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  actorId: z.string().nullable(),
  type: z.string(),
  data: z.unknown().nullable(),
  createdAt: date,
});
export const agreementDetailSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  bidId: z.string(),
  buyer: publicUserSchema,
  provider: publicUserSchema,
  status: AgreementStatus,
  listing: listingSummarySchema.optional(),
  bid: bidSchema.optional(),
  conversationId: z.string().nullable().optional(),
  myRole: z.enum(['buyer', 'provider']).optional(),
  myConfirmation: z.boolean().optional(),
  milestones: z.array(milestoneResponseSchema),
  deliverables: z.array(deliverableResponseSchema),
  events: z.array(agreementEventSchema),
  createdAt: date,
  updatedAt: date,
});
export const agreementSchema = agreementDetailSchema;
export const agreementSummarySchema = z.object({
  id: z.string(),
  listingId: z.string(),
  bidId: z.string(),
  buyer: publicUserSchema,
  provider: publicUserSchema,
  status: AgreementStatus,
  listing: listingSummarySchema.optional(),
  bid: bidSchema.optional(),
  conversationId: z.string().nullable().optional(),
  myRole: z.enum(['buyer', 'provider']).optional(),
  myConfirmation: z.boolean().optional(),
  milestones: z.array(milestoneResponseSchema),
  deliverables: z.array(deliverableSummarySchema),
  createdAt: date,
  updatedAt: date,
});
export const bidAcceptResponseSchema = z.object({
  bid: bidSchema,
  agreement: agreementSchema,
});
export type BidAcceptResponse = z.infer<typeof bidAcceptResponseSchema>;
export const messageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  sender: publicUserSchema,
  type: MessageType,
  body: z.string().nullable(),
  voiceDurationSec: z.number().nullable(),
  attachments: z.array(attachmentSchema),
  createdAt: date,
});
export const conversationSchema = z.object({
  id: z.string(),
  listingId: z.string().nullable(),
  bidId: z.string().nullable(),
  agreementId: z.string().nullable(),
  participants: z.array(publicUserSchema),
  otherParticipant: publicUserSchema.optional(),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative().optional(),
  createdAt: date,
  updatedAt: date,
});
export const notificationSchema = z.object({
  id: z.string(),
  type: NotificationType,
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  data: z.unknown().nullable(),
  readAt: date.nullable(),
  createdAt: date,
});
export const reviewItemSchema = z.object({
  id: z.string(),
  agreementId: z.string(),
  author: publicUserSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  createdAt: date,
});
export const dashboardSummarySchema = z.object({
  listings: z.object({
    open: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  bids: z.object({
    pending: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
  }),
  agreements: z.object({
    active: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  unreadMessages: z.number().int().nonnegative(),
  unreadNotifications: z.number().int(),
});
export const adminStatsSchema = z.object({
  users: z.number().int(),
  listings: z.number().int(),
  agreements: z.number().int(),
  openReports: z.number().int(),
});
export const auditLogItemSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  data: z.unknown().nullable(),
  createdAt: date,
});
export const authResponseSchema = z.object({ accessToken: z.string(), user: privateUserSchema });
export type ListingSummary = z.infer<typeof listingSummarySchema>;
export type ListingDetail = z.infer<typeof listingDetailSchema>;
export type Bid = z.infer<typeof bidSchema>;
export type Agreement = z.infer<typeof agreementSchema>;
export type AgreementDetail = z.infer<typeof agreementDetailSchema>;
export type AgreementSummary = z.infer<typeof agreementSummarySchema>;
export type MilestoneResponse = z.infer<typeof milestoneResponseSchema>;
export type DeliverableResponse = z.infer<typeof deliverableResponseSchema>;
export type AgreementEvent = z.infer<typeof agreementEventSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type AgreementsQueryInput = z.infer<typeof agreementsQuerySchema>;
export type RevisionRequestInput = z.infer<typeof revisionRequestSchema>;
export type AgreementCancelInput = z.infer<typeof agreementCancelSchema>;
export type DisputeInput = z.infer<typeof disputeSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type IdParamInput = z.infer<typeof idParamSchema>;
export type Message = z.infer<typeof messageSchema>;
export type Conversation = z.infer<typeof conversationSchema>;
export type Notification = z.infer<typeof notificationSchema>;
export const wsPayloadSchemas = {
  typing: z.object({ conversationId: z.string(), isTyping: z.boolean() }),
  conversationJoin: z.object({ conversationId: z.string() }),
  read: z.object({ conversationId: z.string(), lastMessageId: z.string() }),
};
export const wsServerPayloadSchemas = {
  'message:new': messageSchema,
  typing: z.object({ conversationId: z.string(), userId: z.string(), isTyping: z.boolean() }),
  presence: z.object({ userId: z.string(), online: z.boolean() }),
  'bid:updated': bidSchema,
  'agreement:updated': agreementSchema,
  'message:read': z.object({
    conversationId: z.string(),
    userId: z.string(),
    lastMessageId: z.string(),
  }),
  'notification:new': notificationSchema,
};
export type WsServerPayloads = {
  [K in keyof typeof wsServerPayloadSchemas]: z.infer<(typeof wsServerPayloadSchemas)[K]>;
};
export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parentId: z.string().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});
export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parentId: z.string().nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
});
export const categoryUpdateSchema = categoryCreateSchema.partial();
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export type CategoryTreeNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string | null;
  listingCount: number;
  children: CategoryTreeNode[];
};

export const categoryTreeNodeSchema: z.ZodType<CategoryTreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    parentId: z.string().nullable(),
    description: z.string().nullable(),
    listingCount: z.number().int().nonnegative(),
    children: z.array(categoryTreeNodeSchema),
  }),
);
export type Category = CategoryTreeNode;
export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
export const reportSchema = z.object({
  targetType: ReportTargetType,
  targetId: z.string(),
  reason: ReportReason,
  details: z.string().trim().max(2000).optional(),
});
export const wsEventNames = {
  conversationJoin: 'conversation:join',
  conversationLeave: 'conversation:leave',
  typing: 'typing',
  messageRead: 'message:read',
  messageNew: 'message:new',
  notificationNew: 'notification:new',
  presence: 'presence',
  bidUpdated: 'bid:updated',
  agreementUpdated: 'agreement:updated',
} as const;
export const errorSchema = z.object({
  error: z.object({
    code: z.enum([
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMITED',
      'INTERNAL',
    ]),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ListingCreateInput = z.infer<typeof listingCreateSchema>;
export type ListingUpdateInput = z.infer<typeof listingUpdateSchema>;
export type ListingQueryInput = z.infer<typeof listingQuerySchema>;
export type UploadPresignInput = z.infer<typeof uploadPresignSchema>;
export type BidCreateInput = z.infer<typeof bidCreateSchema>;
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;
export type ConversationCreateInput = z.infer<typeof conversationCreateSchema>;
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;
export type MessagesQueryInput = z.infer<typeof messagesQuerySchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type ListingCreateFormInput = z.input<typeof listingCreateSchema>;
export type ApiError = z.infer<typeof errorSchema>;
export type Upload = z.infer<typeof uploadSchema>;
export type UploadPresignRequest = z.input<typeof uploadPresignSchema>;
export type Role = z.infer<typeof Role>;
export type UserStatus = z.infer<typeof UserStatus>;
export type ListingKind = z.infer<typeof ListingKind>;
export type ListingStatus = z.infer<typeof ListingStatus>;
export type PriceType = z.infer<typeof PriceType>;
export type BidStatus = z.infer<typeof BidStatus>;
export type MessageType = z.infer<typeof MessageType>;
export type AgreementStatus = z.infer<typeof AgreementStatus>;
export type MilestoneStatus = z.infer<typeof MilestoneStatus>;
export type UploadPurpose = z.infer<typeof UploadPurpose>;
export type NotificationType = z.infer<typeof NotificationType>;
export type ReportTargetType = z.infer<typeof ReportTargetType>;
export type ReportReason = z.infer<typeof ReportReason>;
export type ReportStatus = z.infer<typeof ReportStatus>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type ListingFilters = z.input<typeof listingQuerySchema>;
export type ListingSort = NonNullable<z.input<typeof listingQuerySchema>['sort']>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type PaginatedResponse<T> = { items: T[]; nextCursor: string | null };
export type ReviewItem = z.infer<typeof reviewItemSchema>;

export const categoryTreeSchema = categoryTreeNodeSchema;
