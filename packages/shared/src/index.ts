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
export const ReportTargetType = z.enum(['LISTING', 'USER', 'MESSAGE', 'BID']);
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
  avatarKey: z.string().max(500).nullable().optional(),
  isBusiness: z.boolean().optional(),
  companyName: z.string().trim().min(1).max(120).nullable().optional(),
});
export const paginationSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const idParamSchema = z.object({ id: z.string().min(1) });
export const listingCreateSchema = z
  .object({
    kind: ListingKind,
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(20).max(10000),
    categoryId: z.string(),
    priceType: PriceType,
    priceMinCents: z.number().int().nonnegative().optional(),
    priceMaxCents: z.number().int().nonnegative().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('USD'),
    deliveryDays: z.number().int().positive().optional(),
    location: z.string().max(120).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
    imageIds: z.array(z.string()).optional(),
    attachmentIds: z.array(z.string()).optional(),
    expiresAt: z.iso.datetime().optional(),
    status: z.enum(['DRAFT', 'OPEN']).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.priceType === 'RANGE' && (v.priceMinCents === undefined || v.priceMaxCents === undefined))
      ctx.addIssue({
        code: 'custom',
        message: 'Range prices require min and max',
        path: ['priceMinCents'],
      });
    if (
      v.priceMinCents !== undefined &&
      v.priceMaxCents !== undefined &&
      v.priceMinCents > v.priceMaxCents
    )
      ctx.addIssue({
        code: 'custom',
        message: 'priceMinCents must not exceed priceMaxCents',
        path: ['priceMinCents'],
      });
  });
export const listingQuerySchema = paginationSchema
  .extend({
    q: z.string().max(200).optional(),
    kind: ListingKind.optional(),
    categoryId: z.string().optional(),
    categorySlug: z.string().optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().nonnegative().optional(),
    currency: z.string().length(3).optional(),
    location: z.string().max(120).optional(),
    status: ListingStatus.default('OPEN'),
    ownerId: z.string().optional(),
    sort: z
      .enum(['newest', 'price_asc', 'price_desc', 'ending_soon', 'most_bids'])
      .default('newest'),
  })
  .refine((v) => v.minPrice === undefined || v.maxPrice === undefined || v.minPrice <= v.maxPrice, {
    message: 'minPrice must not exceed maxPrice',
    path: ['minPrice'],
  });
export const bidCreateSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default('USD'),
  deliveryDays: z.number().int().positive(),
  message: z.string().trim().max(5000),
  attachmentIds: z.array(z.string()).optional(),
});
export const messageCreateSchema = z
  .object({
    type: MessageType,
    body: z.string().trim().max(10000).optional(),
    attachmentIds: z.array(z.string()).optional(),
    voiceDurationSec: z.number().positive().optional(),
  })
  .refine((v) => v.type !== 'TEXT' || !!v.body, {
    message: 'Text messages require body',
    path: ['body'],
  });
export const uploadPresignSchema = z.object({
  purpose: UploadPurpose,
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});
export const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  parentId: z.string().nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});
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
export type BidCreateInput = z.infer<typeof bidCreateSchema>;
export type MessageCreateInput = z.infer<typeof messageCreateSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type ApiError = z.infer<typeof errorSchema>;
