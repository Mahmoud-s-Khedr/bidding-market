// TEMP: replace with @market/shared after API-06 merges
import { z } from 'zod';

export const Role = z.enum(['USER', 'ADMIN']);
export type Role = z.infer<typeof Role>;

export const UserStatus = z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']);
export type UserStatus = z.infer<typeof UserStatus>;

export const ListingStatus = z.enum([
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
  'REMOVED',
]);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const ReportTargetType = z.enum(['LISTING', 'USER', 'MESSAGE', 'BID', 'AGREEMENT']);
export type ReportTargetType = z.infer<typeof ReportTargetType>;

export const ReportReason = z.enum(['SPAM', 'FRAUD', 'INAPPROPRIATE', 'HARASSMENT', 'OTHER']);
export type ReportReason = z.infer<typeof ReportReason>;

export const ReportStatus = z.enum(['OPEN', 'RESOLVED', 'DISMISSED']);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const ReportResolution = z.enum(['DISMISS', 'REMOVE_CONTENT', 'SUSPEND_USER']);
export type ReportResolution = z.infer<typeof ReportResolution>;

export const reportSchema = z.object({
  targetType: ReportTargetType,
  targetId: z.string().min(1, 'Target ID is required'),
  reason: ReportReason,
  details: z.string().trim().max(2000, 'Details cannot exceed 2000 characters').optional(),
});
export type ReportInput = z.infer<typeof reportSchema>;

export const reportResponseSchema = z.object({
  id: z.string(),
  reporterId: z.string(),
  targetType: ReportTargetType,
  targetId: z.string(),
  reason: ReportReason,
  details: z.string().nullable(),
  status: ReportStatus,
  resolution: ReportResolution.nullable(),
  resolutionNote: z.string().nullable(),
  resolvedById: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  resolvedAt: z.union([z.string(), z.date()]).nullable(),
});
export type ReportResponse = z.infer<typeof reportResponseSchema>;

export const adminUserUpdateSchema = z.object({
  role: Role.optional(),
  status: UserStatus.optional(),
  reason: z.string().max(2000, 'Reason cannot exceed 2000 characters').optional(),
});
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

export const adminResolveReportSchema = z.object({
  action: z.enum(['DISMISS', 'REMOVE_CONTENT', 'SUSPEND_USER']),
  note: z
    .string()
    .min(1, 'Resolution note is required')
    .max(2000, 'Note cannot exceed 2000 characters'),
});
export type AdminResolveReportInput = z.infer<typeof adminResolveReportSchema>;

export const adminListingActionSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(2000, 'Reason cannot exceed 2000 characters'),
});
export type AdminListingActionInput = z.infer<typeof adminListingActionSchema>;

export const adminUsersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().optional(),
  role: Role.optional(),
  status: UserStatus.optional(),
});
export type AdminUsersQueryInput = z.infer<typeof adminUsersQuerySchema>;

export const adminListingsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().optional(),
  status: ListingStatus.optional(),
});
export type AdminListingsQueryInput = z.infer<typeof adminListingsQuerySchema>;

export const adminReportsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: ReportStatus.optional(),
});
export type AdminReportsQueryInput = z.infer<typeof adminReportsQuerySchema>;

export const adminStatsSchema = z.object({
  users: z.object({
    ACTIVE: z.number().int(),
    SUSPENDED: z.number().int(),
    BANNED: z.number().int(),
  }),
  listings: z.object({
    DRAFT: z.number().int(),
    OPEN: z.number().int(),
    IN_PROGRESS: z.number().int(),
    COMPLETED: z.number().int(),
    CLOSED: z.number().int(),
    REMOVED: z.number().int(),
  }),
  bids: z.number().int(),
  agreements: z.object({
    ACTIVE: z.number().int(),
    DELIVERED: z.number().int(),
    COMPLETED: z.number().int(),
    CANCELLED: z.number().int(),
    DISPUTED: z.number().int(),
  }),
  openReports: z.number().int(),
  daily: z.array(
    z.object({
      day: z.string(),
      signups: z.number(),
      listings: z.number(),
      bids: z.number(),
      agreements: z.number(),
    }),
  ),
});
export type AdminStats = z.infer<typeof adminStatsSchema>;

export interface AdminUserItem {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  suspendedReason: string | null;
  suspendedAt: string | null;
  displayName: string;
  createdAt: string;
}

export interface AdminListingItem {
  id: string;
  title: string;
  description: string;
  kind: 'REQUEST' | 'OFFER';
  status: ListingStatus;
  categoryId: string;
  priceType: 'FIXED' | 'RANGE' | 'NEGOTIABLE';
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  deliveryDays: number | null;
  location: string | null;
  tags?: string[];
  removedReason: string | null;
  removedAt: string | null;
  previousStatus: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  owner: {
    id: string;
    displayName: string;
  };
}

export type AdminReportTargetPreview =
  | { id: string; title: string; status: string }
  | { id: string; displayName: string; status: string }
  | { id: string; conversationId?: string; body: string | null; deletedAt?: string | null }
  | { id: string; amountCents?: number; status: string }
  | { id: string; status: string }
  | null;

export interface AdminReportItem {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolution: ReportResolution | null;
  resolutionNote: string | null;
  resolvedById: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: {
    id: string;
    displayName: string;
    email: string;
  };
  target: AdminReportTargetPreview;
}

export interface AuditLogItem {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  data: unknown;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}
