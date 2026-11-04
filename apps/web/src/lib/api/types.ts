import {
  BidStatus,
  bidCreateSchema,
  bidUpdateSchema,
  bidCounterSchema,
  bidRejectSchema,
  bidSortSchema,
  bidQuerySchema,
  myBidsQuerySchema,
  bidRevisionSchema,
  bidSchema,
  bidDetailSchema,
  bidWithListingSchema,
  bidAcceptResponseSchema,
  type Attachment as SharedAttachment,
  type Category as SharedCategory,
  type ListingDetail as SharedListingDetail,
  type ListingFilters as SharedListingFilters,
  type ListingSort as SharedListingSort,
  type ListingSummary as SharedListingSummary,
  type PrivateUser,
  type PublicUser as SharedPublicUser,
  type Role,
  type UserStatus,
  type ListingKind,
  type ListingStatus,
  type PriceType,
  type UploadPurpose,
  type AuthResponse as SharedAuthResponse,
  type ListingCreateInput,
  type ListingUpdateInput,
  type PaginatedResponse as SharedPaginatedResponse,
  type ApiError,
  type ReviewItem as SharedReviewItem,
  type UpdateProfileInput as SharedUpdateProfileInput,
  type ListingCreateFormInput,
  type UploadPresignResponse,
  type Bid as SharedBid,
  type BidRevision as SharedBidRevision,
  type BidCreateInput,
  type BidUpdateInput,
  type BidCounterInput,
  type BidRejectInput,
  type BidSort,
  type BidQueryInput,
  type MyBidsQueryInput,
  type BidAcceptResponse,
} from '@market/shared';

export * from './bid-transitions';

export {
  BidStatus,
  bidCreateSchema,
  bidUpdateSchema,
  bidCounterSchema,
  bidRejectSchema,
  bidSortSchema,
  bidQuerySchema,
  myBidsQuerySchema,
  bidRevisionSchema,
  bidSchema,
  bidDetailSchema,
  bidWithListingSchema,
  bidAcceptResponseSchema,
};

export type {
  BidStatus as BidStatusType,
  BidCreateInput,
  BidUpdateInput,
  BidCounterInput,
  BidRejectInput,
  BidSort,
  BidQueryInput,
  MyBidsQueryInput,
  BidAcceptResponse,
};

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

export type PresignUploadResponse = UploadPresignResponse;

export interface PresignedGetUrlResponse {
  url: string;
  expiresAt?: string;
}

export type Category = SharedCategory;

export type ListingFilters = SharedListingFilters;
export type ListingSort = SharedListingSort;

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
  | 'myBid'
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
  category: {
    id: string;
    name: string;
    slug: string;
    parentId?: string | null;
  };
  myBid?: Bid | null;
};

export type CreateListingRequest = ListingCreateInput;
export type ListingCreateFormInputType = ListingCreateFormInput;
export type UpdateProfileInput = SharedUpdateProfileInput;
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

export type Bid = Omit<SharedBid, 'createdAt' | 'updatedAt' | 'bidder' | 'attachments'> & {
  bidder: PublicUser;
  attachments?: Attachment[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type BidRevision = Omit<SharedBidRevision, 'createdAt' | 'author'> & {
  author?: PublicUser;
  createdAt: Date | string;
};

export type BidDetail = Bid & {
  attachments: Attachment[];
  revisions: BidRevision[];
  listing?: ListingSummary;
};

export type BidWithListing = Bid & {
  listing: ListingSummary;
  attachments: Attachment[];
};
