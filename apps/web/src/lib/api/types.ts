export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  isBusiness: boolean;
  companyName?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  completedCount?: number;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | (string & {});

export interface ApiErrorPayload {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  isBusiness: boolean;
  companyName?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  completedCount?: number;
  createdAt: string;
}

export type UploadPurpose =
  | 'LISTING_IMAGE'
  | 'LISTING_ATTACHMENT'
  | 'BID_ATTACHMENT'
  | 'MESSAGE_ATTACHMENT'
  | 'DELIVERABLE'
  | 'AVATAR';

export interface PresignUploadRequest {
  purpose: UploadPurpose;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignUploadResponse {
  uploadId: string;
  url: string;
  fields?: Record<string, string>;
  headers?: Record<string, string>;
  key: string;
  expiresAt: string;
}

export interface Attachment {
  id: string;
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignedGetUrlResponse {
  url: string;
  expiresAt?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children?: Category[];
  listingCount?: number;
  description?: string | null;
}

export type ListingKind = 'REQUEST' | 'OFFER';
export type ListingStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'REMOVED';
export type PriceType = 'FIXED' | 'RANGE' | 'NEGOTIABLE';
export type ListingSort = 'newest' | 'price_asc' | 'price_desc' | 'ending_soon' | 'most_bids';

export interface ListingFilters {
  q?: string;
  kind?: ListingKind;
  categoryId?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  location?: string;
  status?: ListingStatus;
  ownerId?: string;
  sort?: ListingSort;
  cursor?: string;
  limit?: number;
}

export interface ListingSummary {
  id: string;
  title: string;
  slug?: string;
  description?: string;
  kind: ListingKind;
  status: ListingStatus;
  priceType: PriceType;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  currency: string;
  deliveryDays?: number | null;
  location?: string | null;
  tags: string[];
  categoryId: string;
  category: {
    id: string;
    name: string;
    slug: string;
  };
  ownerId: string;
  owner: PublicUser;
  images: Attachment[];
  bidCount: number;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingDetail extends ListingSummary {
  description: string;
  attachments: Attachment[];
  myBid?: unknown;
}

export interface CreateListingRequest {
  kind: ListingKind;
  title: string;
  description: string;
  categoryId: string;
  priceType: PriceType;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  currency?: string;
  deliveryDays?: number | null;
  location?: string | null;
  tags?: string[];
  imageIds?: string[];
  attachmentIds?: string[];
  expiresAt?: string | null;
  status?: 'DRAFT' | 'OPEN';
}

export type UpdateListingRequest = Partial<CreateListingRequest>;

export interface ReviewItem {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  author: PublicUser;
}
