import type {
  Attachment as SharedAttachment,
  Category as SharedCategory,
  ListingDetail as SharedListingDetail,
  ListingFilters as SharedListingFilters,
  ListingSort as SharedListingSort,
  ListingSummary as SharedListingSummary,
  PrivateUser,
  PublicUser as SharedPublicUser,
  Role,
  UserStatus,
  ListingKind,
  ListingStatus,
  PriceType,
  UploadPurpose,
  AuthResponse as SharedAuthResponse,
  ListingCreateInput,
  ListingUpdateInput,
  PaginatedResponse as SharedPaginatedResponse,
  ApiError,
  ReviewItem as SharedReviewItem,
} from '@market/shared';

export type UserRole = Role;
export type { Role, UserStatus, ListingKind, ListingStatus, PriceType, UploadPurpose };

export type PublicUser = Omit<
  SharedPublicUser,
  | 'createdAt'
  | 'avatarUrl'
  | 'bio'
  | 'location'
  | 'companyName'
  | 'ratingAvg'
  | 'ratingCount'
  | 'completedCount'
> & {
  createdAt: Date | string;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  companyName?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  completedCount?: number;
};

export type PrivateUserType = PrivateUser;
export type User = Omit<
  PrivateUser,
  | 'createdAt'
  | 'avatarUrl'
  | 'bio'
  | 'location'
  | 'companyName'
  | 'ratingAvg'
  | 'ratingCount'
  | 'completedCount'
> & {
  createdAt: Date | string;
  avatarUrl?: string | null;
  bio?: string | null;
  location?: string | null;
  companyName?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
  completedCount?: number;
};

export type AuthResponse = Omit<SharedAuthResponse, 'user'> & {
  user: User;
};

export type ApiErrorCode = ApiError['error']['code'] | (string & {});

export type ApiErrorPayload = ApiError;

export type PaginatedResponse<T> = SharedPaginatedResponse<T>;

export type Attachment = SharedAttachment & {
  url?: string;
};

export interface PresignUploadRequest {
  purpose: UploadPurpose;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PresignUploadResponse {
  uploadId: string;
  url: string;
  headers?: Record<string, string>;
  key?: string;
  expiresAt?: string;
  // Optional legacy fields for backward compatibility
  upload?: {
    id: string;
    key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    purpose: UploadPurpose;
    status: 'PENDING' | 'READY' | 'FAILED';
    createdAt: Date | string;
    completedAt: Date | string | null;
  };
  uploadUrl?: string;
}

export interface PresignedGetUrlResponse {
  url: string;
  expiresAt?: string;
}

export type Category = SharedCategory;

export type ListingFilters = Omit<SharedListingFilters, 'sort'> & {
  sort?: ListingSort;
};
export type ListingSort =
  | SharedListingSort
  | 'relevance'
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'ending_soon'
  | 'most_bids';

export type ListingSummary = Omit<
  SharedListingSummary,
  'createdAt' | 'expiresAt' | 'owner' | 'location' | 'priceMinCents' | 'priceMaxCents'
> & {
  createdAt: Date | string;
  expiresAt?: Date | string | null;
  location?: string | null;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  owner: PublicUser;
  thumbnailUrl?: string | null;
  categoryName?: string;
};

export type ListingDetail = Omit<
  SharedListingDetail,
  | 'createdAt'
  | 'updatedAt'
  | 'expiresAt'
  | 'owner'
  | 'images'
  | 'attachments'
  | 'location'
  | 'priceMinCents'
  | 'priceMaxCents'
  | 'deliveryDays'
> & {
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt?: Date | string | null;
  location?: string | null;
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  deliveryDays?: number | null;
  owner: PublicUser;
  images: Attachment[];
  attachments: Attachment[];
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  myBid?: unknown;
};

export type CreateListingRequest = ListingCreateInput;
export type UpdateListingRequest = Omit<
  ListingUpdateInput,
  'priceMinCents' | 'priceMaxCents' | 'deliveryDays' | 'location' | 'expiresAt'
> & {
  priceMinCents?: number | null;
  priceMaxCents?: number | null;
  deliveryDays?: number | null;
  location?: string | null;
  expiresAt?: string | null;
};

export type ReviewItem = Omit<SharedReviewItem, 'createdAt' | 'author' | 'comment'> & {
  createdAt: Date | string;
  comment?: string | null;
  author: PublicUser;
};
