import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  ListingCreateInput,
  ListingDetail,
  ListingQueryInput,
  ListingSummary,
  ListingUpdateInput,
} from '@market/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../common/auth.js';
import { paginate, type PaginatedResult } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { UserPresenter } from '../users/user.presenter.js';
import { decodeCursor, encodeCursor, type ListingSort } from './listings.cursor.js';
import { ListingPresenter, type ListingSummaryInput } from './listing.presenter.js';

export function validatePriceRules(
  priceType: 'FIXED' | 'RANGE' | 'NEGOTIABLE',
  priceMinCents: number | null | undefined,
  priceMaxCents: number | null | undefined,
): void {
  if (priceType === 'FIXED') {
    if (priceMinCents === undefined || priceMinCents === null) {
      throw new BadRequestException('Fixed prices require priceMinCents');
    }
    if (priceMaxCents !== undefined && priceMaxCents !== null) {
      throw new BadRequestException('Fixed prices must not specify priceMaxCents');
    }
  } else if (priceType === 'RANGE') {
    if (
      priceMinCents === undefined ||
      priceMinCents === null ||
      priceMaxCents === undefined ||
      priceMaxCents === null
    ) {
      throw new BadRequestException('Range prices require min and max');
    }
    if (priceMinCents > priceMaxCents) {
      throw new BadRequestException('priceMinCents must not exceed priceMaxCents');
    }
  } else if (priceType === 'NEGOTIABLE') {
    if (
      (priceMinCents !== undefined && priceMinCents !== null) ||
      (priceMaxCents !== undefined && priceMaxCents !== null)
    ) {
      throw new BadRequestException(
        'Negotiable prices must not specify priceMinCents or priceMaxCents',
      );
    }
  }
}

interface RawListingRow {
  id: string;
  ownerId: string;
  categoryId: string;
  categoryName: string;
  firstImageKey: string | null;
  kind: 'REQUEST' | 'OFFER';
  status: 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED' | 'REMOVED';
  title: string;
  priceType: 'FIXED' | 'RANGE' | 'NEGOTIABLE';
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  location: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  bidCount: number;
  rank?: number;
  owner_id: string;
  owner_displayName: string;
  owner_avatarKey: string | null;
  owner_bio: string | null;
  owner_location: string | null;
  owner_isBusiness: boolean;
  owner_companyName: string | null;
  owner_ratingAvg: number;
  owner_ratingCount: number;
  owner_completedCount: number;
  owner_createdAt: Date;
}

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);
  private readonly listingPresenter: ListingPresenter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly categoriesService: CategoriesService,
    private readonly userPresenter: UserPresenter,
    @Optional() listingPresenter?: ListingPresenter,
  ) {
    this.listingPresenter = listingPresenter ?? new ListingPresenter(storage, userPresenter);
  }

  async toSummary(listing: ListingSummaryInput): Promise<ListingSummary> {
    return this.listingPresenter.toSummary(listing);
  }

  private async safeInvalidateCategories(): Promise<void> {
    try {
      await this.categoriesService.invalidateCache();
    } catch (err) {
      this.logger.warn(`Error invalidating categories cache: ${String(err)}`);
    }
  }

  async validateUploads(
    userId: string,
    uploadIds: string[],
    purpose: 'LISTING_IMAGE' | 'LISTING_ATTACHMENT',
    currentListingId?: string,
  ): Promise<void> {
    if (uploadIds.length === 0) return;
    if (new Set(uploadIds).size !== uploadIds.length) {
      throw new BadRequestException('Duplicate upload IDs provided');
    }
    const uploads = await this.prisma.upload.findMany({
      where: { id: { in: uploadIds } },
    });
    if (uploads.length !== uploadIds.length) {
      throw new BadRequestException('One or more uploads not found');
    }
    for (const upload of uploads) {
      if (upload.uploaderId !== userId) {
        throw new BadRequestException('Upload belongs to another user');
      }
      if (upload.status !== 'READY') {
        throw new BadRequestException('Upload is not ready');
      }
      if (upload.purpose !== purpose) {
        throw new BadRequestException(`Upload purpose must be ${purpose}`);
      }
    }

    const existingImage = await this.prisma.listingImage.findFirst({
      where: {
        uploadId: { in: uploadIds },
        ...(currentListingId ? { listingId: { not: currentListingId } } : {}),
      },
    });
    if (existingImage) {
      throw new ConflictException('Upload is already attached to another listing');
    }

    const existingAttachment = await this.prisma.listingAttachment.findFirst({
      where: {
        uploadId: { in: uploadIds },
        ...(currentListingId ? { listingId: { not: currentListingId } } : {}),
      },
    });
    if (existingAttachment) {
      throw new ConflictException('Upload is already attached to another listing');
    }
  }

  async create(userId: string, input: ListingCreateInput): Promise<ListingDetail> {
    const category = await this.prisma.category.findUnique({
      where: { id: input.categoryId },
    });
    if (!category) {
      throw new BadRequestException('Category not found');
    }

    validatePriceRules(input.priceType, input.priceMinCents, input.priceMaxCents);

    if (input.imageIds && input.attachmentIds) {
      const overlap = input.imageIds.filter((id) => input.attachmentIds!.includes(id));
      if (overlap.length > 0) {
        throw new BadRequestException('Upload cannot be both an image and an attachment');
      }
    }

    if (input.imageIds && input.imageIds.length > 0) {
      await this.validateUploads(userId, input.imageIds, 'LISTING_IMAGE');
    }
    if (input.attachmentIds && input.attachmentIds.length > 0) {
      await this.validateUploads(userId, input.attachmentIds, 'LISTING_ATTACHMENT');
    }

    try {
      const listing = await this.prisma.$transaction(async (tx) => {
        const created = await tx.listing.create({
          data: {
            ownerId: userId,
            categoryId: input.categoryId,
            kind: input.kind,
            status: input.status ?? 'OPEN',
            title: input.title,
            description: input.description,
            priceType: input.priceType,
            priceMinCents: input.priceMinCents ?? null,
            priceMaxCents: input.priceMaxCents ?? null,
            currency: input.currency,
            deliveryDays: input.deliveryDays ?? null,
            location: input.location ?? null,
            tags: input.tags ?? [],
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          },
        });

        if (input.imageIds && input.imageIds.length > 0) {
          for (const [position, uploadId] of input.imageIds.entries()) {
            await tx.listingImage.create({
              data: { listingId: created.id, uploadId, position },
            });
          }
        }

        if (input.attachmentIds && input.attachmentIds.length > 0) {
          for (const uploadId of input.attachmentIds) {
            await tx.listingAttachment.create({
              data: { listingId: created.id, uploadId },
            });
          }
        }

        return created;
      });

      await this.safeInvalidateCategories();

      return this.getById(listing.id, { id: userId, role: 'USER' });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Upload is already attached to another listing');
      }
      throw err;
    }
  }

  async update(user: AuthUser, id: string, input: ListingUpdateInput): Promise<ListingDetail> {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        images: { select: { uploadId: true } },
        attachments: { select: { uploadId: true } },
      },
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.ownerId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You cannot edit this listing');
    }

    if (['IN_PROGRESS', 'COMPLETED', 'REMOVED'].includes(listing.status)) {
      throw new ConflictException('Cannot edit listing in current status');
    }

    if (listing.status === 'CLOSED' && input.status !== undefined) {
      if (input.status === 'OPEN') {
        throw new ConflictException('Cannot reopen a closed listing');
      }
      throw new ConflictException('Cannot modify status of a closed listing');
    }
    if (listing.status === 'OPEN' && input.status === 'DRAFT') {
      const bidCount = await this.prisma.bid.count({ where: { listingId: id } });
      if (bidCount > 0) {
        throw new ConflictException('Cannot revert listing with bids to draft');
      }
    }

    if (input.kind !== undefined && input.kind !== listing.kind) {
      const bidCount = await this.prisma.bid.count({ where: { listingId: id } });
      if (bidCount > 0) {
        throw new ConflictException('Cannot change kind on a listing that has bids');
      }
    }

    if (input.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: input.categoryId },
      });
      if (!category) {
        throw new BadRequestException('Category not found');
      }
    }

    const effectivePriceType = input.priceType ?? listing.priceType;
    const effectiveMin =
      input.priceMinCents !== undefined ? input.priceMinCents : listing.priceMinCents;
    const effectiveMax =
      input.priceMaxCents !== undefined ? input.priceMaxCents : listing.priceMaxCents;

    validatePriceRules(effectivePriceType, effectiveMin, effectiveMax);

    const effectiveImageIds =
      input.imageIds !== undefined
        ? input.imageIds
        : (listing.images?.map((img) => img.uploadId) ?? []);
    const effectiveAttachmentIds =
      input.attachmentIds !== undefined
        ? input.attachmentIds
        : (listing.attachments?.map((att) => att.uploadId) ?? []);

    const overlap = effectiveImageIds.filter((x) => effectiveAttachmentIds.includes(x));
    if (overlap.length > 0) {
      throw new BadRequestException('Upload cannot be both an image and an attachment');
    }

    const targetOwnerId = listing.ownerId;
    if (input.imageIds) {
      await this.validateUploads(targetOwnerId, input.imageIds, 'LISTING_IMAGE', id);
    }
    if (input.attachmentIds) {
      await this.validateUploads(targetOwnerId, input.attachmentIds, 'LISTING_ATTACHMENT', id);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (input.kind !== undefined && input.kind !== listing.kind) {
          // Serialize kind changes with bid creation, which locks this same listing row.
          await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "Listing" WHERE id = ${id} FOR UPDATE
          `;
          const bidCount = await tx.bid.count({ where: { listingId: id } });
          if (bidCount > 0) {
            throw new ConflictException('Cannot change kind on a listing that has bids');
          }
        }

        if (input.imageIds !== undefined) {
          await tx.listingImage.deleteMany({ where: { listingId: id } });
          for (const [position, uploadId] of input.imageIds.entries()) {
            await tx.listingImage.create({
              data: { listingId: id, uploadId, position },
            });
          }
        }
        if (input.attachmentIds !== undefined) {
          await tx.listingAttachment.deleteMany({ where: { listingId: id } });
          for (const uploadId of input.attachmentIds) {
            await tx.listingAttachment.create({
              data: { listingId: id, uploadId },
            });
          }
        }

        await tx.listing.update({
          where: { id },
          data: {
            ...(input.kind !== undefined && { kind: input.kind }),
            ...(input.title !== undefined && { title: input.title }),
            ...(input.description !== undefined && { description: input.description }),
            ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
            ...(input.priceType !== undefined && { priceType: input.priceType }),
            ...(input.priceMinCents !== undefined && { priceMinCents: input.priceMinCents }),
            ...(input.priceMaxCents !== undefined && { priceMaxCents: input.priceMaxCents }),
            ...(input.currency !== undefined && { currency: input.currency }),
            ...(input.deliveryDays !== undefined && { deliveryDays: input.deliveryDays }),
            ...(input.location !== undefined && { location: input.location }),
            ...(input.tags !== undefined && { tags: input.tags }),
            ...(input.expiresAt !== undefined && {
              expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            }),
            ...(input.status !== undefined && { status: input.status }),
          },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Upload is already attached to another listing');
      }
      throw err;
    }

    await this.safeInvalidateCategories();

    return this.getById(id, user);
  }

  async close(user: AuthUser, id: string): Promise<ListingDetail> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.ownerId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You cannot close this listing');
    }
    if (listing.status !== 'OPEN') {
      throw new ConflictException('Only OPEN listings can be closed');
    }

    await this.prisma.$transaction(async (tx) => {
      const res = await tx.listing.updateMany({
        where: { id, status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      if (res.count === 0) {
        throw new ConflictException('Only OPEN listings can be closed');
      }
      await tx.bid.updateMany({
        where: {
          listingId: id,
          status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] },
        },
        data: { status: 'DECLINED' },
      });
    });

    await this.safeInvalidateCategories();

    return this.getById(id, user);
  }

  async delete(user: AuthUser, id: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.ownerId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('You cannot delete this listing');
    }

    if (listing.status === 'DRAFT') {
      await this.prisma.$transaction(async (tx) => {
        await tx.bid.deleteMany({ where: { listingId: id } });
        const res = await tx.listing.deleteMany({
          where: { id, status: 'DRAFT' },
        });
        if (res.count === 0) {
          throw new ConflictException('Listing status changed concurrently');
        }
      });
    } else {
      const bidCount = await this.prisma.bid.count({ where: { listingId: id } });
      if (bidCount > 0) {
        throw new ConflictException('Cannot delete listing with bids unless DRAFT');
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          // Never call bid.deleteMany for non-DRAFT listings
          const res = await tx.listing.deleteMany({
            where: { id, status: listing.status },
          });
          if (res.count === 0) {
            throw new ConflictException('Listing status changed concurrently');
          }
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
          throw new ConflictException('Cannot delete listing with bids unless DRAFT');
        }
        throw err;
      }
    }

    await this.safeInvalidateCategories();
  }

  async getById(id: string, user?: AuthUser): Promise<ListingDetail> {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            avatarKey: true,
            bio: true,
            location: true,
            isBusiness: true,
            companyName: true,
            ratingAvg: true,
            ratingCount: true,
            completedCount: true,
            createdAt: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            parentId: true,
          },
        },
        images: {
          orderBy: { position: 'asc' },
          include: { upload: true },
        },
        attachments: {
          include: { upload: true },
        },
        _count: {
          select: {
            bids: {
              where: {
                status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED', 'ACCEPTED'] },
              },
            },
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status === 'DRAFT' || listing.status === 'REMOVED') {
      const isOwner = user && user.id === listing.ownerId;
      const isAdmin = user && user.role === 'ADMIN';
      if (!isOwner && !isAdmin) {
        throw new NotFoundException('Listing not found');
      }
    }

    let myBid = null;
    if (user) {
      const bid = await this.prisma.bid.findFirst({
        where: {
          listingId: id,
          bidderId: user.id,
          status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] },
        },
        include: {
          bidder: {
            select: {
              id: true,
              displayName: true,
              avatarKey: true,
              bio: true,
              location: true,
              isBusiness: true,
              companyName: true,
              ratingAvg: true,
              ratingCount: true,
              completedCount: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (bid) {
        myBid = {
          id: bid.id,
          listingId: bid.listingId,
          bidder: await this.userPresenter.toPublicUser(bid.bidder),
          amountCents: bid.amountCents,
          currency: bid.currency,
          deliveryDays: bid.deliveryDays,
          message: bid.message,
          status: bid.status,
          rejectReason: bid.rejectReason,
          lastCounterById: bid.lastCounterById,
          createdAt: bid.createdAt,
          updatedAt: bid.updatedAt,
        };
      }
    }

    const images = await Promise.all(
      listing.images.map(async (img) => ({
        id: img.upload.id,
        key: img.upload.key,
        fileName: img.upload.fileName,
        mimeType: img.upload.mimeType,
        sizeBytes: img.upload.sizeBytes,
        url: await this.storage.presignGet(img.upload.key),
      })),
    );

    const attachments = await Promise.all(
      listing.attachments.map(async (att) => ({
        id: att.upload.id,
        key: att.upload.key,
        fileName: att.upload.fileName,
        mimeType: att.upload.mimeType,
        sizeBytes: att.upload.sizeBytes,
        url: await this.storage.presignGet(att.upload.key),
      })),
    );

    return {
      id: listing.id,
      owner: await this.userPresenter.toPublicUser(listing.owner),
      categoryId: listing.categoryId,
      categoryName: listing.category.name,
      category: listing.category,
      thumbnailUrl: images[0]?.url ?? null,
      kind: listing.kind,
      status: listing.status,
      title: listing.title,
      description: listing.description,
      priceType: listing.priceType,
      priceMinCents: listing.priceMinCents,
      priceMaxCents: listing.priceMaxCents,
      currency: listing.currency,
      deliveryDays: listing.deliveryDays,
      location: listing.location,
      tags: listing.tags,
      expiresAt: listing.expiresAt,
      images,
      attachments,
      bidCount: listing._count.bids,
      myBid,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    };
  }

  async list(query: ListingQueryInput, user?: AuthUser): Promise<PaginatedResult<ListingSummary>> {
    const conditions: Prisma.Sql[] = [];

    if (query.q && query.q.trim()) {
      const qTrim = query.q.trim();
      conditions.push(
        Prisma.sql`to_tsvector('simple', l.title || ' ' || l.description) @@ websearch_to_tsquery('simple', ${qTrim})`,
      );
    }

    if (query.kind) {
      conditions.push(Prisma.sql`l.kind = ${query.kind}::"ListingKind"`);
    }

    if (query.categoryId || query.categorySlug) {
      const target = query.categoryId
        ? await this.prisma.category.findUnique({ where: { id: query.categoryId } })
        : await this.prisma.category.findUnique({ where: { slug: query.categorySlug } });
      if (!target) {
        return { items: [], nextCursor: null };
      }
      const descendantIds = await this.categoriesService.getDescendantCategoryIds(target.id);
      const categoryIds = [target.id, ...descendantIds];
      conditions.push(Prisma.sql`l."categoryId" IN (${Prisma.join(categoryIds)})`);
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      conditions.push(Prisma.sql`l."priceMinCents" IS NOT NULL`);
      if (query.minPrice !== undefined) {
        conditions.push(
          Prisma.sql`COALESCE(l."priceMaxCents", l."priceMinCents") >= ${query.minPrice}`,
        );
      }
      if (query.maxPrice !== undefined) {
        conditions.push(Prisma.sql`l."priceMinCents" <= ${query.maxPrice}`);
      }
    }

    if (query.currency) {
      conditions.push(Prisma.sql`l.currency = ${query.currency}`);
    }

    if (query.location && query.location.trim()) {
      const locPattern = `%${query.location.trim()}%`;
      conditions.push(Prisma.sql`l.location ILIKE ${locPattern}`);
    }

    if (query.ownerId === 'me') {
      if (!user) {
        throw new UnauthorizedException('Authentication required for ownerId=me');
      }
      conditions.push(Prisma.sql`l."ownerId" = ${user.id}`);
      if (query.status) {
        conditions.push(Prisma.sql`l.status = ${query.status}::"ListingStatus"`);
      }
    } else {
      if (query.ownerId) {
        conditions.push(Prisma.sql`l."ownerId" = ${query.ownerId}`);
      }
      const status = query.status ?? 'OPEN';
      const isAdmin = user && user.role === 'ADMIN';
      if (!isAdmin && (status === 'DRAFT' || status === 'REMOVED')) {
        throw new ForbiddenException('Cannot query draft or removed listings');
      }
      conditions.push(Prisma.sql`l.status = ${status}::"ListingStatus"`);
      if (status === 'OPEN') {
        conditions.push(Prisma.sql`(l."expiresAt" IS NULL OR l."expiresAt" > NOW())`);
      }
    }

    const hasSearchQuery = Boolean(query.q && query.q.trim());
    const sort: ListingSort =
      query.sort === 'relevance' && !hasSearchQuery ? 'newest' : (query.sort ?? 'newest');

    if (query.cursor) {
      const d = decodeCursor(query.cursor, sort);
      if (sort === 'newest') {
        const sv = d.sortValue as string;
        conditions.push(
          Prisma.sql`(l."createdAt" < ${sv}::timestamptz OR (l."createdAt" = ${sv}::timestamptz AND l.id < ${d.id}))`,
        );
      } else if (sort === 'price_asc') {
        const sv = d.sortValue !== null ? (d.sortValue as number) : 2147483647;
        conditions.push(
          Prisma.sql`(COALESCE(l."priceMinCents", 2147483647) > ${sv} OR (COALESCE(l."priceMinCents", 2147483647) = ${sv} AND l.id > ${d.id}))`,
        );
      } else if (sort === 'price_desc') {
        const sv = d.sortValue !== null ? (d.sortValue as number) : -1;
        conditions.push(
          Prisma.sql`(COALESCE(l."priceMinCents", -1) < ${sv} OR (COALESCE(l."priceMinCents", -1) = ${sv} AND l.id < ${d.id}))`,
        );
      } else if (sort === 'ending_soon') {
        const sv = d.sortValue !== null ? (d.sortValue as string) : '9999-12-31T23:59:59.999Z';
        conditions.push(
          Prisma.sql`(COALESCE(l."expiresAt", '9999-12-31T23:59:59.999Z'::timestamptz) > ${sv}::timestamptz OR (COALESCE(l."expiresAt", '9999-12-31T23:59:59.999Z'::timestamptz) = ${sv}::timestamptz AND l.id > ${d.id}))`,
        );
      } else if (sort === 'most_bids') {
        const sv = d.sortValue as number;
        conditions.push(
          Prisma.sql`(bc."bidCount" < ${sv} OR (bc."bidCount" = ${sv} AND l.id < ${d.id}))`,
        );
      } else if (sort === 'relevance' && query.q?.trim()) {
        const sv = d.sortValue as number;
        conditions.push(
          Prisma.sql`(rk.rank < ${sv}::float8 OR (rk.rank = ${sv}::float8 AND l.id < ${d.id}))`,
        );
      }
    }

    let orderByClause: Prisma.Sql;
    if (sort === 'newest') {
      orderByClause = Prisma.sql`ORDER BY l."createdAt" DESC, l.id DESC`;
    } else if (sort === 'price_asc') {
      orderByClause = Prisma.sql`ORDER BY COALESCE(l."priceMinCents", 2147483647) ASC, l.id ASC`;
    } else if (sort === 'price_desc') {
      orderByClause = Prisma.sql`ORDER BY COALESCE(l."priceMinCents", -1) DESC, l.id DESC`;
    } else if (sort === 'ending_soon') {
      orderByClause = Prisma.sql`ORDER BY COALESCE(l."expiresAt", '9999-12-31T23:59:59.999Z'::timestamptz) ASC, l.id ASC`;
    } else if (sort === 'most_bids') {
      orderByClause = Prisma.sql`ORDER BY bc."bidCount" DESC, l.id DESC`;
    } else if (sort === 'relevance' && query.q?.trim()) {
      orderByClause = Prisma.sql`ORDER BY rk.rank DESC, l.id DESC`;
    } else {
      orderByClause = Prisma.sql`ORDER BY l."createdAt" DESC, l.id DESC`;
    }

    const rankLateral =
      sort === 'relevance' && query.q?.trim()
        ? Prisma.sql`LEFT JOIN LATERAL (
            SELECT ts_rank(to_tsvector('simple', l.title || ' ' || l.description), websearch_to_tsquery('simple', ${query.q.trim()}))::float8 AS rank
          ) rk ON true`
        : Prisma.empty;

    const rankSelect =
      sort === 'relevance' && query.q?.trim() ? Prisma.sql`, rk.rank` : Prisma.empty;

    const whereClause =
      conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    const limit = query.limit ?? 20;
    const take = limit + 1;

    const rows = await this.prisma.$queryRaw<RawListingRow[]>(Prisma.sql`
      SELECT
        l.id,
        l."ownerId",
        l."categoryId",
        l.kind,
        l.status,
        l.title,
        l."priceType",
        l."priceMinCents",
        l."priceMaxCents",
        l.currency,
        l.location,
        l."expiresAt",
        l."createdAt",
        bc."bidCount"
        ${rankSelect},
        c.name AS "categoryName",
        img."firstImageKey",
        u.id AS "owner_id",
        u."displayName" AS "owner_displayName",
        u."avatarKey" AS "owner_avatarKey",
        u.bio AS "owner_bio",
        u.location AS "owner_location",
        u."isBusiness" AS "owner_isBusiness",
        u."companyName" AS "owner_companyName",
        u."ratingAvg" AS "owner_ratingAvg",
        u."ratingCount" AS "owner_ratingCount",
        u."completedCount" AS "owner_completedCount",
        u."createdAt" AS "owner_createdAt"
      FROM "Listing" l
      JOIN "User" u ON u.id = l."ownerId"
      JOIN "Category" c ON c.id = l."categoryId"
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS "bidCount" FROM "Bid" b
        WHERE b."listingId" = l.id AND b."status" IN ('PENDING', 'SHORTLISTED', 'COUNTERED', 'ACCEPTED')
      ) bc ON true
      LEFT JOIN LATERAL (
        SELECT up.key AS "firstImageKey"
        FROM "ListingImage" li
        JOIN "Upload" up ON up.id = li."uploadId"
        WHERE li."listingId" = l.id
        ORDER BY li.position ASC
        LIMIT 1
      ) img ON true
      ${rankLateral}
      ${whereClause}
      ${orderByClause}
      LIMIT ${take}
    `);

    const getCursorValue = (row: RawListingRow): string | number | null => {
      if (sort === 'newest') return row.createdAt.toISOString();
      if (sort === 'price_asc' || sort === 'price_desc') return row.priceMinCents;
      if (sort === 'ending_soon') return row.expiresAt ? row.expiresAt.toISOString() : null;
      if (sort === 'most_bids') return row.bidCount;
      if (sort === 'relevance') return row.rank ?? 0;
      return row.createdAt.toISOString();
    };

    const paginatedResult = paginate(rows, limit, (row) =>
      encodeCursor(sort, getCursorValue(row), row.id),
    );

    const items: ListingSummary[] = await Promise.all(
      paginatedResult.items.map(async (r) =>
        this.toSummary({
          id: r.id,
          owner: {
            id: r.owner_id,
            displayName: r.owner_displayName,
            avatarKey: r.owner_avatarKey,
            bio: r.owner_bio,
            location: r.owner_location,
            isBusiness: r.owner_isBusiness,
            companyName: r.owner_companyName,
            ratingAvg: r.owner_ratingAvg,
            ratingCount: r.owner_ratingCount,
            completedCount: r.owner_completedCount,
            createdAt: r.owner_createdAt,
          },
          categoryId: r.categoryId,
          categoryName: r.categoryName,
          firstImageKey: r.firstImageKey,
          kind: r.kind,
          status: r.status,
          title: r.title,
          priceType: r.priceType,
          priceMinCents: r.priceMinCents,
          priceMaxCents: r.priceMaxCents,
          currency: r.currency,
          location: r.location,
          expiresAt: r.expiresAt,
          bidCount: r.bidCount,
          createdAt: r.createdAt,
        }),
      ),
    );

    return {
      items,
      nextCursor: paginatedResult.nextCursor,
    };
  }
}
