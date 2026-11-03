import { Injectable } from '@nestjs/common';
import type { ListingSummary } from '@market/shared';
import { StorageService } from '../../storage/storage.service.js';
import { UserPresenter, type PublicUserData } from '../users/user.presenter.js';

export interface ListingSummaryInput {
  id: string;
  owner: PublicUserData;
  categoryId: string;
  categoryName?: string | null;
  category?: { name: string } | null;
  thumbnailUrl?: string | null;
  firstImageKey?: string | null;
  images?: Array<{ upload: { key: string } }> | null;
  kind: 'REQUEST' | 'OFFER';
  status: 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'REMOVED';
  title: string;
  priceType: 'FIXED' | 'RANGE' | 'NEGOTIABLE';
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  location: string | null;
  expiresAt: Date | null;
  bidCount?: number;
  _count?: { bids: number };
  createdAt: Date;
}

@Injectable()
export class ListingPresenter {
  constructor(
    private readonly storage: StorageService,
    private readonly userPresenter: UserPresenter,
  ) {}

  async toSummary(listing: ListingSummaryInput): Promise<ListingSummary> {
    let thumbnailUrl = listing.thumbnailUrl ?? null;
    if (!thumbnailUrl) {
      const imageKey = listing.firstImageKey ?? listing.images?.[0]?.upload?.key;
      if (imageKey) {
        thumbnailUrl = await this.storage.presignGet(imageKey);
      }
    }

    const categoryName = listing.categoryName ?? listing.category?.name ?? '';
    const owner = await this.userPresenter.toPublicUser(listing.owner);
    const bidCount = listing.bidCount ?? listing._count?.bids ?? 0;

    return {
      id: listing.id,
      owner,
      categoryId: listing.categoryId,
      categoryName,
      thumbnailUrl,
      kind: listing.kind,
      status: listing.status,
      title: listing.title,
      priceType: listing.priceType,
      priceMinCents: listing.priceMinCents,
      priceMaxCents: listing.priceMaxCents,
      currency: listing.currency,
      location: listing.location,
      expiresAt: listing.expiresAt,
      bidCount,
      createdAt: listing.createdAt,
    };
  }
}

export async function toListingSummary(
  listing: ListingSummaryInput,
  storage: StorageService,
  userPresenter: UserPresenter,
): Promise<ListingSummary> {
  const presenter = new ListingPresenter(storage, userPresenter);
  return presenter.toSummary(listing);
}
