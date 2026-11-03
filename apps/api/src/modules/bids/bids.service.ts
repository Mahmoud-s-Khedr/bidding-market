import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  Agreement,
  Attachment,
  BidAcceptResponse,
  BidCounterInput,
  BidCreateInput,
  BidDetail,
  BidQueryInput,
  BidSort,
  BidUpdateInput,
  BidWithListing,
  MyBidsQueryInput,
} from '@market/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../common/auth.js';
import { paginate, type PaginatedResult } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { CategoriesService } from '../categories/categories.service.js';
import { UserPresenter, publicUserSelect } from '../users/user.presenter.js';
import { ListingPresenter } from '../listings/listing.presenter.js';
import { decodeBidCursor, encodeBidCursor } from './bid.cursor.js';
import {
  BID_EVENTS,
  BidAcceptedEvent,
  BidCounteredEvent,
  BidCreatedEvent,
  BidRejectedEvent,
  BidUpdatedEvent,
  BidWithdrawnEvent,
} from './bid.events.js';
import { assertBidTransition } from './bid.state-machine.js';

export { publicUserSelect };

interface RawBidRow {
  id: string;
  listingId: string;
  bidderId: string;
  amountCents: number;
  currency: string;
  deliveryDays: number;
  message: string;
  status:
    'PENDING' | 'SHORTLISTED' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'DECLINED';
  rejectReason: string | null;
  lastCounterById: string | null;
  createdAt: Date;
  updatedAt: Date;
  bidder_id: string;
  bidder_displayName: string;
  bidder_avatarKey: string | null;
  bidder_bio: string | null;
  bidder_location: string | null;
  bidder_isBusiness: boolean;
  bidder_companyName: string | null;
  bidder_ratingAvg: number;
  bidder_ratingCount: number;
  bidder_completedCount: number;
  bidder_createdAt: Date;
}

@Injectable()
export class BidsService {
  private readonly logger = new Logger(BidsService.name);
  private readonly userPresenter: UserPresenter;
  private readonly listingPresenter: ListingPresenter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly eventEmitter: EventEmitter2,
    private readonly categoriesService: CategoriesService,
    @Optional() userPresenter?: UserPresenter,
    @Optional() listingPresenter?: ListingPresenter,
  ) {
    this.userPresenter = userPresenter ?? new UserPresenter(storage);
    this.listingPresenter = listingPresenter ?? new ListingPresenter(storage, this.userPresenter);
  }

  private safeEmit(event: string, payload: unknown): void {
    try {
      this.eventEmitter.emit(event, payload);
    } catch (err) {
      this.logger.error(`Error emitting event ${event}: ${String(err)}`);
    }
  }

  private async safeInvalidateCategories(): Promise<void> {
    try {
      await this.categoriesService.invalidateCache();
    } catch (err) {
      this.logger.warn(`Error invalidating categories cache: ${String(err)}`);
    }
  }

  async create(listingId: string, input: BidCreateInput, user: AuthUser): Promise<BidDetail> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status === 'DRAFT' || listing.status === 'REMOVED') {
      const isOwner = user.id === listing.ownerId;
      const isAdmin = user.role === 'ADMIN';
      if (!isOwner && !isAdmin) {
        throw new NotFoundException('Listing not found');
      }
    }

    if (listing.ownerId === user.id) {
      throw new ConflictException('Cannot bid on your own listing');
    }

    if (listing.status !== 'OPEN') {
      throw new ConflictException('Listing is not open for bidding');
    }

    if (listing.expiresAt && listing.expiresAt < new Date()) {
      throw new ConflictException('Listing has expired');
    }

    const existingActive = await this.prisma.bid.findFirst({
      where: {
        listingId,
        bidderId: user.id,
        status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] },
      },
    });

    if (existingActive) {
      throw new ConflictException('You already have an active bid on this listing');
    }

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      const validUploads = await this.prisma.upload.findMany({
        where: {
          id: { in: input.attachmentIds },
          uploaderId: user.id,
          status: 'READY',
          purpose: 'BID_ATTACHMENT',
        },
      });

      if (validUploads.length !== input.attachmentIds.length) {
        throw new BadRequestException(
          'All attachments must be READY BID_ATTACHMENT uploads owned by the user',
        );
      }
    }

    try {
      const bid = await this.prisma.$transaction(async (tx) => {
        // Non-blocking (a): Lock/check listing row inside the transaction so close vs create cannot race
        const openListing = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "Listing"
          WHERE id = ${listingId} AND status = 'OPEN' AND kind = ${listing.kind}::"ListingKind"
          FOR UPDATE
        `;
        if (openListing.length === 0) {
          throw new ConflictException('Listing is not open for bidding');
        }

        const createdBid = await tx.bid.create({
          data: {
            listingId,
            bidderId: user.id,
            amountCents: input.amountCents,
            currency: input.currency ?? 'USD',
            deliveryDays: input.deliveryDays,
            message: input.message,
            status: 'PENDING',
          },
        });

        await tx.bidRevision.create({
          data: {
            bidId: createdBid.id,
            authorId: user.id,
            amountCents: input.amountCents,
            deliveryDays: input.deliveryDays,
            message: input.message,
          },
        });

        if (input.attachmentIds && input.attachmentIds.length > 0) {
          await tx.bidAttachment.createMany({
            data: input.attachmentIds.map((uploadId) => ({
              bidId: createdBid.id,
              uploadId,
            })),
          });
        }

        return tx.bid.findUniqueOrThrow({
          where: { id: createdBid.id },
          include: {
            bidder: { select: publicUserSelect },
            attachments: { include: { upload: true } },
            revisions: {
              include: { author: { select: publicUserSelect } },
              orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
            },
          },
        });
      });

      const detail = await this.mapBidDetail(bid);
      this.safeEmit(BID_EVENTS.CREATED, new BidCreatedEvent(detail, user.id));
      return detail;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You already have an active bid on this listing');
      }
      throw error;
    }
  }

  async findByListing(
    listingId: string,
    query: BidQueryInput,
    user: AuthUser,
  ): Promise<PaginatedResult<BidDetail>> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    const isOwner = listing.ownerId === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      const myBidsCount = await this.prisma.bid.count({
        where: { listingId, bidderId: user.id },
      });
      // Non-blocking (d): Return 404 to a user with no bid for consistency
      if (myBidsCount === 0) {
        throw new NotFoundException('Listing not found');
      }
    }

    const sort: BidSort = query.sort ?? 'newest';
    const conditions: Prisma.Sql[] = [Prisma.sql`b."listingId" = ${listingId}`];

    if (!isOwner && !isAdmin) {
      conditions.push(Prisma.sql`b."bidderId" = ${user.id}`);
    }

    if (query.cursor) {
      const decoded = decodeBidCursor(query.cursor, sort);
      const { sortValue, id } = decoded;

      if (sort === 'newest') {
        if (sortValue !== null) {
          conditions.push(
            Prisma.sql`(b."createdAt" < ${sortValue}::timestamptz OR (b."createdAt" = ${sortValue}::timestamptz AND b.id < ${id}))`,
          );
        } else {
          conditions.push(Prisma.sql`b.id < ${id}`);
        }
      } else if (sort === 'amount_asc') {
        if (sortValue !== null) {
          conditions.push(
            Prisma.sql`(b."amountCents" > ${sortValue}::int OR (b."amountCents" = ${sortValue}::int AND b.id < ${id}))`,
          );
        } else {
          conditions.push(Prisma.sql`b.id < ${id}`);
        }
      } else if (sort === 'amount_desc') {
        if (sortValue !== null) {
          conditions.push(
            Prisma.sql`(b."amountCents" < ${sortValue}::int OR (b."amountCents" = ${sortValue}::int AND b.id < ${id}))`,
          );
        } else {
          conditions.push(Prisma.sql`b.id < ${id}`);
        }
      } else if (sort === 'delivery') {
        if (sortValue !== null) {
          conditions.push(
            Prisma.sql`(b."deliveryDays" > ${sortValue}::int OR (b."deliveryDays" = ${sortValue}::int AND b.id < ${id}))`,
          );
        } else {
          conditions.push(Prisma.sql`b.id < ${id}`);
        }
      } else if (sort === 'rating') {
        if (sortValue !== null) {
          conditions.push(
            Prisma.sql`(u."ratingAvg" < ${sortValue}::float OR (u."ratingAvg" = ${sortValue}::float AND b.id < ${id}))`,
          );
        } else {
          conditions.push(Prisma.sql`b.id < ${id}`);
        }
      }
    }

    let orderByClause: Prisma.Sql;
    if (sort === 'amount_asc') {
      orderByClause = Prisma.sql`ORDER BY b."amountCents" ASC, b.id DESC`;
    } else if (sort === 'amount_desc') {
      orderByClause = Prisma.sql`ORDER BY b."amountCents" DESC, b.id DESC`;
    } else if (sort === 'delivery') {
      orderByClause = Prisma.sql`ORDER BY b."deliveryDays" ASC, b.id DESC`;
    } else if (sort === 'rating') {
      orderByClause = Prisma.sql`ORDER BY u."ratingAvg" DESC, b.id DESC`;
    } else {
      orderByClause = Prisma.sql`ORDER BY b."createdAt" DESC, b.id DESC`;
    }

    const limit = query.limit ?? 20;
    const take = limit + 1;
    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    const rows = await this.prisma.$queryRaw<RawBidRow[]>`
      SELECT
        b.id,
        b."listingId",
        b."bidderId",
        b."amountCents",
        b.currency,
        b."deliveryDays",
        b.message,
        b.status,
        b."rejectReason",
        b."lastCounterById",
        b."createdAt",
        b."updatedAt",
        u.id AS "bidder_id",
        u."displayName" AS "bidder_displayName",
        u."avatarKey" AS "bidder_avatarKey",
        u.bio AS "bidder_bio",
        u.location AS "bidder_location",
        u."isBusiness" AS "bidder_isBusiness",
        u."companyName" AS "bidder_companyName",
        u."ratingAvg" AS "bidder_ratingAvg",
        u."ratingCount" AS "bidder_ratingCount",
        u."completedCount" AS "bidder_completedCount",
        u."createdAt" AS "bidder_createdAt"
      FROM "Bid" b
      JOIN "User" u ON u.id = b."bidderId"
      ${whereClause}
      ${orderByClause}
      LIMIT ${take}
    `;

    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;

    const bidIds = pageRows.map((r) => r.id);
    const attachments =
      bidIds.length > 0
        ? await this.prisma.bidAttachment.findMany({
            where: { bidId: { in: bidIds } },
            include: { upload: true },
          })
        : [];

    const attachmentsByBidId = new Map<
      string,
      Array<{ upload: (typeof attachments)[0]['upload'] }>
    >();
    for (const att of attachments) {
      const list = attachmentsByBidId.get(att.bidId) ?? [];
      list.push(att);
      attachmentsByBidId.set(att.bidId, list);
    }

    const items: BidDetail[] = await Promise.all(
      pageRows.map(async (row) => {
        const atts = await this.mapAttachments(attachmentsByBidId.get(row.id) ?? []);
        const bidder = await this.userPresenter.toPublicUser({
          id: row.bidder_id,
          displayName: row.bidder_displayName,
          avatarKey: row.bidder_avatarKey,
          bio: row.bidder_bio,
          location: row.bidder_location,
          isBusiness: row.bidder_isBusiness,
          companyName: row.bidder_companyName,
          ratingAvg: row.bidder_ratingAvg,
          ratingCount: row.bidder_ratingCount,
          completedCount: row.bidder_completedCount,
          createdAt: row.bidder_createdAt,
        });

        return {
          id: row.id,
          listingId: row.listingId,
          bidder,
          amountCents: row.amountCents,
          currency: row.currency,
          deliveryDays: row.deliveryDays,
          message: row.message,
          status: row.status,
          rejectReason: row.rejectReason,
          lastCounterById: row.lastCounterById,
          attachments: atts,
          revisions: [],
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    );

    let nextCursor: string | null = null;
    if (hasNextPage && pageRows.length > 0) {
      const lastRow = pageRows[pageRows.length - 1];
      if (lastRow) {
        let sortValue: string | number | null = null;
        if (sort === 'amount_asc' || sort === 'amount_desc') {
          sortValue = lastRow.amountCents;
        } else if (sort === 'delivery') {
          sortValue = lastRow.deliveryDays;
        } else if (sort === 'rating') {
          sortValue = lastRow.bidder_ratingAvg;
        } else {
          sortValue = lastRow.createdAt.toISOString();
        }
        nextCursor = encodeBidCursor(sort, sortValue, lastRow.id);
      }
    }

    return { items, nextCursor };
  }

  async findMine(
    query: MyBidsQueryInput,
    user: AuthUser,
  ): Promise<PaginatedResult<BidWithListing>> {
    const limit = query.limit ?? 20;

    // Non-blocking (f): Reject NUL-byte or malformed cursor with 400
    if (query.cursor) {
      if (
        query.cursor.includes('\0') ||
        !/^[a-zA-Z0-9_-]+$/.test(query.cursor) ||
        query.cursor.trim().length === 0
      ) {
        throw new BadRequestException('Invalid pagination cursor');
      }
    }

    try {
      const bids = await this.prisma.bid.findMany({
        where: {
          bidderId: user.id,
          ...(query.status ? { status: query.status } : {}),
        },
        take: limit + 1,
        cursor: query.cursor ? { id: query.cursor } : undefined,
        skip: query.cursor ? 1 : 0,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          listing: {
            include: {
              owner: { select: publicUserSelect },
              category: true,
              images: {
                orderBy: { position: 'asc' },
                take: 1,
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
          },
        },
      });

      const paginated = paginate(bids, limit);

      const items: BidWithListing[] = await Promise.all(
        paginated.items.map(async (bid) => {
          const attachments = await this.mapAttachments(bid.attachments);
          const bidder = await this.userPresenter.toPublicUser(bid.bidder);
          const listing = await this.listingPresenter.toSummary({
            id: bid.listing.id,
            owner: bid.listing.owner,
            categoryId: bid.listing.categoryId,
            category: bid.listing.category,
            categoryName: bid.listing.category.name,
            images: bid.listing.images,
            kind: bid.listing.kind,
            status: bid.listing.status,
            title: bid.listing.title,
            priceType: bid.listing.priceType,
            priceMinCents: bid.listing.priceMinCents,
            priceMaxCents: bid.listing.priceMaxCents,
            currency: bid.listing.currency,
            location: bid.listing.location,
            expiresAt: bid.listing.expiresAt,
            bidCount: bid.listing._count.bids,
            createdAt: bid.listing.createdAt,
          });

          return {
            id: bid.id,
            listingId: bid.listingId,
            bidder,
            amountCents: bid.amountCents,
            currency: bid.currency,
            deliveryDays: bid.deliveryDays,
            message: bid.message,
            status: bid.status,
            rejectReason: bid.rejectReason,
            lastCounterById: bid.lastCounterById,
            attachments,
            createdAt: bid.createdAt,
            updatedAt: bid.updatedAt,
            listing,
          };
        }),
      );

      return {
        items,
        nextCursor: paginated.nextCursor,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new BadRequestException('Invalid pagination cursor');
      }
      throw error;
    }
  }

  async findById(id: string, user: AuthUser): Promise<BidDetail> {
    const bid = await this.prisma.bid.findUnique({
      where: { id },
      include: {
        bidder: { select: publicUserSelect },
        listing: {
          include: {
            owner: { select: publicUserSelect },
            category: true,
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
        },
        attachments: { include: { upload: true } },
        revisions: {
          include: { author: { select: publicUserSelect } },
          orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    const isBidder = bid.bidderId === user.id;
    const isOwner = bid.listing.ownerId === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!isBidder && !isOwner && !isAdmin) {
      throw new ForbiddenException('You do not have access to this bid');
    }

    return this.mapBidDetail(bid);
  }

  async update(id: string, input: BidUpdateInput, user: AuthUser): Promise<BidDetail> {
    const preBid = await this.prisma.bid.findUnique({
      where: { id },
      include: {
        listing: true,
      },
    });

    if (!preBid) {
      throw new NotFoundException('Bid not found');
    }

    if (preBid.bidderId !== user.id) {
      throw new ForbiddenException('Only the bidder can edit this bid');
    }

    assertBidTransition(preBid.status, 'EDIT', 'bidder');

    if (preBid.listing.status !== 'OPEN') {
      throw new ConflictException('Listing is no longer open');
    }

    if (input.attachmentIds && input.attachmentIds.length > 0) {
      const validUploads = await this.prisma.upload.findMany({
        where: {
          id: { in: input.attachmentIds },
          uploaderId: user.id,
          status: 'READY',
          purpose: 'BID_ATTACHMENT',
        },
      });

      if (validUploads.length !== input.attachmentIds.length) {
        throw new BadRequestException(
          'All attachments must be READY BID_ATTACHMENT uploads owned by the user',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Row lock on bid
      const lockedBids = await tx.$queryRaw<Array<Prisma.BidGetPayload<Record<string, never>>>>`
        SELECT * FROM "Bid" WHERE id = ${id} FOR UPDATE
      `;
      const currentBid = lockedBids[0];
      if (!currentBid) {
        throw new NotFoundException('Bid not found');
      }

      // Re-verify transition under lock
      assertBidTransition(currentBid.status, 'EDIT', 'bidder');

      // Re-verify listing status inside tx
      const listing = await tx.listing.findUnique({
        where: { id: currentBid.listingId },
        select: { status: true, expiresAt: true },
      });
      if (!listing || listing.status !== 'OPEN') {
        throw new ConflictException('Listing is no longer open');
      }
      if (listing.expiresAt && listing.expiresAt < new Date()) {
        throw new ConflictException('Listing has expired');
      }

      const newAmount = input.amountCents ?? currentBid.amountCents;
      const newDelivery = input.deliveryDays ?? currentBid.deliveryDays;
      const newMessage = input.message ?? currentBid.message;
      const newCurrency = input.currency ?? currentBid.currency;

      await tx.bidRevision.create({
        data: {
          bidId: currentBid.id,
          authorId: user.id,
          amountCents: newAmount,
          deliveryDays: newDelivery,
          message: newMessage,
        },
      });

      if (input.attachmentIds !== undefined) {
        await tx.bidAttachment.deleteMany({ where: { bidId: currentBid.id } });
        if (input.attachmentIds.length > 0) {
          await tx.bidAttachment.createMany({
            data: input.attachmentIds.map((uploadId: string) => ({
              bidId: currentBid.id,
              uploadId,
            })),
          });
        }
      }

      await tx.bid.update({
        where: { id: currentBid.id },
        data: {
          amountCents: newAmount,
          currency: newCurrency,
          deliveryDays: newDelivery,
          message: newMessage,
          status: 'PENDING',
        },
      });

      return tx.bid.findUniqueOrThrow({
        where: { id: currentBid.id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    const detail = await this.mapBidDetail(updated);
    this.safeEmit(BID_EVENTS.UPDATED, new BidUpdatedEvent(detail, user.id));
    return detail;
  }

  async withdraw(id: string, user: AuthUser): Promise<BidDetail> {
    const preBid = await this.prisma.bid.findUnique({
      where: { id },
    });

    if (!preBid) {
      throw new NotFoundException('Bid not found');
    }

    if (preBid.bidderId !== user.id) {
      throw new ForbiddenException('Only the bidder can withdraw this bid');
    }

    assertBidTransition(preBid.status, 'WITHDRAW', 'bidder');

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedBids = await tx.$queryRaw<Array<Prisma.BidGetPayload<Record<string, never>>>>`
        SELECT * FROM "Bid" WHERE id = ${id} FOR UPDATE
      `;
      const currentBid = lockedBids[0];
      if (!currentBid) {
        throw new NotFoundException('Bid not found');
      }

      const nextStatus = assertBidTransition(currentBid.status, 'WITHDRAW', 'bidder');

      await tx.bid.update({
        where: { id },
        data: { status: nextStatus },
      });

      return tx.bid.findUniqueOrThrow({
        where: { id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    const detail = await this.mapBidDetail(updated);
    this.safeEmit(BID_EVENTS.WITHDRAWN, new BidWithdrawnEvent(detail, user.id));
    return detail;
  }

  async shortlist(id: string, user: AuthUser): Promise<BidDetail> {
    const preBid = await this.prisma.bid.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!preBid) {
      throw new NotFoundException('Bid not found');
    }

    if (preBid.listing.ownerId !== user.id) {
      throw new ForbiddenException('Only the listing owner can shortlist a bid');
    }

    assertBidTransition(preBid.status, 'SHORTLIST', 'owner');

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedBids = await tx.$queryRaw<Array<Prisma.BidGetPayload<Record<string, never>>>>`
        SELECT * FROM "Bid" WHERE id = ${id} FOR UPDATE
      `;
      const currentBid = lockedBids[0];
      if (!currentBid) {
        throw new NotFoundException('Bid not found');
      }

      const listing = await tx.listing.findUnique({
        where: { id: currentBid.listingId },
        select: { status: true },
      });
      if (!listing || listing.status !== 'OPEN') {
        throw new ConflictException('Listing is no longer open');
      }

      const nextStatus = assertBidTransition(currentBid.status, 'SHORTLIST', 'owner');

      await tx.bid.update({
        where: { id },
        data: { status: nextStatus },
      });

      return tx.bid.findUniqueOrThrow({
        where: { id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    return this.mapBidDetail(updated);
  }

  async reject(id: string, input: { reason?: string }, user: AuthUser): Promise<BidDetail> {
    const preBid = await this.prisma.bid.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!preBid) {
      throw new NotFoundException('Bid not found');
    }

    if (preBid.listing.ownerId !== user.id) {
      throw new ForbiddenException('Only the listing owner can reject a bid');
    }

    assertBidTransition(preBid.status, 'REJECT', 'owner');

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedBids = await tx.$queryRaw<Array<Prisma.BidGetPayload<Record<string, never>>>>`
        SELECT * FROM "Bid" WHERE id = ${id} FOR UPDATE
      `;
      const currentBid = lockedBids[0];
      if (!currentBid) {
        throw new NotFoundException('Bid not found');
      }

      const nextStatus = assertBidTransition(currentBid.status, 'REJECT', 'owner');

      await tx.bid.update({
        where: { id },
        data: {
          status: nextStatus,
          rejectReason: input.reason ?? null,
        },
      });

      return tx.bid.findUniqueOrThrow({
        where: { id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    const detail = await this.mapBidDetail(updated);
    this.safeEmit(BID_EVENTS.REJECTED, new BidRejectedEvent(detail, user.id, input.reason ?? null));
    return detail;
  }

  async counter(id: string, input: BidCounterInput, user: AuthUser): Promise<BidDetail> {
    const preBid = await this.prisma.bid.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!preBid) {
      throw new NotFoundException('Bid not found');
    }

    if (preBid.listing.ownerId !== user.id) {
      throw new ForbiddenException('Only the listing owner can counter a bid');
    }

    assertBidTransition(preBid.status, 'COUNTER', 'owner');

    const updated = await this.prisma.$transaction(async (tx) => {
      const lockedBids = await tx.$queryRaw<Array<Prisma.BidGetPayload<Record<string, never>>>>`
        SELECT * FROM "Bid" WHERE id = ${id} FOR UPDATE
      `;
      const currentBid = lockedBids[0];
      if (!currentBid) {
        throw new NotFoundException('Bid not found');
      }

      const listing = await tx.listing.findUnique({
        where: { id: currentBid.listingId },
        select: { status: true },
      });
      if (!listing || listing.status !== 'OPEN') {
        throw new ConflictException('Listing is no longer open');
      }

      const nextStatus = assertBidTransition(currentBid.status, 'COUNTER', 'owner');

      await tx.bidRevision.create({
        data: {
          bidId: currentBid.id,
          authorId: user.id,
          amountCents: input.amountCents,
          deliveryDays: input.deliveryDays,
          message: input.message,
        },
      });

      await tx.bid.update({
        where: { id: currentBid.id },
        data: {
          status: nextStatus,
          lastCounterById: user.id,
        },
      });

      return tx.bid.findUniqueOrThrow({
        where: { id: currentBid.id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
    });

    const detail = await this.mapBidDetail(updated);
    this.safeEmit(BID_EVENTS.COUNTERED, new BidCounteredEvent(detail, user.id));
    return detail;
  }

  async accept(id: string, user: AuthUser): Promise<BidAcceptResponse> {
    const bid = await this.prisma.bid.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.listing.ownerId !== user.id) {
      throw new ForbiddenException('Only the listing owner can accept a bid');
    }

    assertBidTransition(bid.status, 'ACCEPT', 'owner');

    if (bid.listing.status !== 'OPEN') {
      throw new ConflictException('Listing is no longer open');
    }

    return this.executeAcceptanceFlow(
      bid,
      {
        expectedStatus: ['PENDING', 'SHORTLISTED', 'COUNTERED'],
        expectedAmountCents: bid.amountCents,
        expectedDeliveryDays: bid.deliveryDays,
        expectedCurrency: bid.currency,
      },
      user,
    );
  }

  async acceptCounter(id: string, user: AuthUser): Promise<BidAcceptResponse> {
    const bid = await this.prisma.bid.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.bidderId !== user.id) {
      throw new ForbiddenException('Only the bidder can accept a counter-offer');
    }

    assertBidTransition(bid.status, 'ACCEPT_COUNTER', 'bidder');

    if (bid.listing.status !== 'OPEN') {
      throw new ConflictException('Listing is no longer open');
    }

    if (!bid.lastCounterById || bid.lastCounterById !== bid.listing.ownerId) {
      throw new ConflictException('No counter offer from owner exists');
    }

    const lastCounterRevision = await this.prisma.bidRevision.findFirst({
      where: {
        bidId: bid.id,
        authorId: bid.listing.ownerId,
      },
      orderBy: [{ seq: 'desc' }, { createdAt: 'desc' }],
    });

    if (!lastCounterRevision) {
      throw new ConflictException('Counter revision not found');
    }

    return this.executeAcceptanceFlow(
      bid,
      {
        expectedStatus: ['COUNTERED'],
        expectedAmountCents: lastCounterRevision.amountCents,
        expectedDeliveryDays: lastCounterRevision.deliveryDays,
        expectedRevisionId: lastCounterRevision.id,
        expectedCurrency: bid.currency,
      },
      user,
    );
  }

  private async executeAcceptanceFlow(
    preBid: Prisma.BidGetPayload<{ include: { listing: true } }>,
    guard: {
      expectedStatus: string[];
      expectedAmountCents: number;
      expectedDeliveryDays: number;
      expectedCurrency: string;
      expectedRevisionId?: string;
    },
    actor: AuthUser,
  ): Promise<BidAcceptResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Conditional update on listing: OPEN -> IN_PROGRESS
      // Include kind in conditional update to ensure kind has not changed concurrently
      const listingUpdate = await tx.listing.updateMany({
        where: { id: preBid.listingId, status: 'OPEN', kind: preBid.listing.kind },
        data: { status: 'IN_PROGRESS' },
      });

      if (listingUpdate.count === 0) {
        throw new ConflictException('Listing is no longer open for acceptance');
      }

      // Re-read current listing row inside transaction
      const currentListing = await tx.listing.findUnique({
        where: { id: preBid.listingId },
        select: { id: true, ownerId: true, kind: true, status: true },
      });
      if (!currentListing) {
        throw new NotFoundException('Listing not found');
      }

      // 2. Lock and re-read the bid row
      const lockedBids = await tx.$queryRaw<Array<Prisma.BidGetPayload<Record<string, never>>>>`
        SELECT * FROM "Bid" WHERE id = ${preBid.id} FOR UPDATE
      `;
      const currentBid = lockedBids[0];
      if (!currentBid) {
        throw new NotFoundException('Bid not found');
      }

      if (!guard.expectedStatus.includes(currentBid.status)) {
        throw new ConflictException(
          `Bid is not in an acceptable status (current: ${currentBid.status})`,
        );
      }

      let finalAmountCents = guard.expectedAmountCents;
      let finalDeliveryDays = guard.expectedDeliveryDays;

      if (guard.expectedRevisionId) {
        // acceptCounter flow: verify latest counter revision has not changed concurrently
        const latestCounter = await tx.bidRevision.findFirst({
          where: {
            bidId: currentBid.id,
            authorId: currentListing.ownerId,
          },
          orderBy: [{ seq: 'desc' }, { createdAt: 'desc' }],
        });

        if (!latestCounter || latestCounter.id !== guard.expectedRevisionId) {
          throw new ConflictException('Counter offer has changed');
        }
        if (currentBid.currency !== guard.expectedCurrency) {
          throw new ConflictException('Bid details have changed');
        }
        finalAmountCents = latestCounter.amountCents;
        finalDeliveryDays = latestCounter.deliveryDays;
      } else {
        // Direct accept flow: verify bidder did not edit amount, delivery, or currency concurrently
        if (
          currentBid.amountCents !== guard.expectedAmountCents ||
          currentBid.deliveryDays !== guard.expectedDeliveryDays ||
          currentBid.currency !== guard.expectedCurrency
        ) {
          throw new ConflictException('Bid details have changed');
        }
      }

      // Update bid to ACCEPTED
      await tx.bid.update({
        where: { id: currentBid.id },
        data: {
          status: 'ACCEPTED',
          amountCents: finalAmountCents,
          deliveryDays: finalDeliveryDays,
        },
      });

      // 3. Decline all other active bids on this listing
      await tx.bid.updateMany({
        where: {
          listingId: currentListing.id,
          id: { not: currentBid.id },
          status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] },
        },
        data: { status: 'DECLINED' },
      });

      // 4. Role derivation:
      // REQUEST listing: owner = buyer, bidder = provider
      // OFFER listing: owner = provider, bidder = buyer
      const isRequest = currentListing.kind === 'REQUEST';
      const buyerId = isRequest ? currentListing.ownerId : currentBid.bidderId;
      const providerId = isRequest ? currentBid.bidderId : currentListing.ownerId;

      // 5. Create Agreement & AgreementEvent CREATED
      const agreement = await tx.agreement.create({
        data: {
          listingId: currentListing.id,
          bidId: currentBid.id,
          buyerId,
          providerId,
          status: 'ACTIVE',
          events: {
            create: {
              actorId: actor.id,
              type: 'CREATED',
              data: {
                initiatorRole: isRequest
                  ? actor.id === buyerId
                    ? 'buyer'
                    : 'provider'
                  : actor.id === providerId
                    ? 'provider'
                    : 'buyer',
                finalAmountCents,
                finalDeliveryDays,
              },
            },
          },
        },
      });

      // 6. Reuse or create Conversation linked to listing/bid/agreement
      const existingConv = await tx.conversation.findFirst({
        where: {
          listingId: currentListing.id,
          participants: {
            some: { userId: currentListing.ownerId },
          },
          AND: [
            {
              participants: {
                some: { userId: currentBid.bidderId },
              },
            },
          ],
        },
      });

      if (existingConv) {
        await tx.conversation.update({
          where: { id: existingConv.id },
          data: {
            agreementId: agreement.id,
            bidId: currentBid.id,
          },
        });
      } else {
        const pair = [currentListing.ownerId, currentBid.bidderId].sort().join(':');
        const listingKey = currentListing.id;
        await tx.conversation.create({
          data: {
            participantPairKey: pair,
            listingDedupKey: listingKey,
            lastMessageAt: new Date(),
            listingId: currentListing.id,
            bidId: currentBid.id,
            agreementId: agreement.id,
            participants: {
              create: [{ userId: currentListing.ownerId }, { userId: currentBid.bidderId }],
            },
          },
        });
      }

      const updatedBid = await tx.bid.findUniqueOrThrow({
        where: { id: currentBid.id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ seq: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });

      const fullAgreement = await tx.agreement.findUniqueOrThrow({
        where: { id: agreement.id },
        include: {
          buyer: { select: publicUserSelect },
          provider: { select: publicUserSelect },
          events: true,
          milestones: true,
          deliverables: { include: { attachments: { include: { upload: true } } } },
        },
      });

      return {
        updatedBid,
        agreement: fullAgreement,
      };
    });

    await this.safeInvalidateCategories();

    const serializedBid = await this.mapBidDetail(result.updatedBid);
    const serializedAgreement = await this.mapAgreement(result.agreement);

    this.safeEmit(
      BID_EVENTS.ACCEPTED,
      new BidAcceptedEvent(serializedBid, serializedAgreement, actor.id),
    );

    return {
      bid: serializedBid,
      agreement: serializedAgreement,
    };
  }

  private async mapAttachments(
    attachments: Array<{ upload: Prisma.UploadGetPayload<Record<string, never>> }>,
  ): Promise<Attachment[]> {
    return Promise.all(
      attachments.map(async (att) => ({
        id: att.upload.id,
        key: att.upload.key,
        fileName: att.upload.fileName,
        mimeType: att.upload.mimeType,
        sizeBytes: att.upload.sizeBytes,
        url: await this.storage.presignGet(att.upload.key),
      })),
    );
  }

  private async mapBidDetail(
    bid: Prisma.BidGetPayload<{
      include: {
        bidder: { select: typeof publicUserSelect };
        attachments: { include: { upload: true } };
        revisions: { include: { author: { select: typeof publicUserSelect } } };
      };
    }>,
  ): Promise<BidDetail> {
    const attachments = await this.mapAttachments(bid.attachments);
    const revisions = await Promise.all(
      bid.revisions.map(async (r) => ({
        id: r.id,
        bidId: r.bidId,
        authorId: r.authorId,
        author: r.author ? await this.userPresenter.toPublicUser(r.author) : undefined,
        amountCents: r.amountCents,
        deliveryDays: r.deliveryDays,
        message: r.message,
        createdAt: r.createdAt,
      })),
    );

    const bidder = await this.userPresenter.toPublicUser(bid.bidder);

    return {
      id: bid.id,
      listingId: bid.listingId,
      bidder,
      amountCents: bid.amountCents,
      currency: bid.currency,
      deliveryDays: bid.deliveryDays,
      message: bid.message,
      status: bid.status,
      rejectReason: bid.rejectReason,
      lastCounterById: bid.lastCounterById,
      attachments,
      revisions,
      createdAt: bid.createdAt,
      updatedAt: bid.updatedAt,
    };
  }

  private async mapAgreement(
    agreement: Prisma.AgreementGetPayload<{
      include: {
        buyer: { select: typeof publicUserSelect };
        provider: { select: typeof publicUserSelect };
        events: true;
        milestones: true;
        deliverables: { include: { attachments: { include: { upload: true } } } };
      };
    }>,
  ): Promise<Agreement> {
    const buyer = await this.userPresenter.toPublicUser(agreement.buyer);
    const provider = await this.userPresenter.toPublicUser(agreement.provider);

    return {
      id: agreement.id,
      listingId: agreement.listingId,
      bidId: agreement.bidId,
      buyer,
      provider,
      status: agreement.status,
      milestones: agreement.milestones.map((m) => ({
        id: m.id,
        agreementId: m.agreementId,
        title: m.title,
        amountCents: m.amountCents,
        dueDate: m.dueDate,
        status: m.status,
        position: m.position,
      })),
      deliverables: agreement.deliverables.map((d) => ({
        id: d.id,
        agreementId: d.agreementId,
        note: d.note,
        submittedById: d.submittedById,
        acceptedAt: d.acceptedAt,
        revisionNote: d.revisionNote,
        attachments: d.attachments.map((a) => ({
          id: a.upload.id,
          key: a.upload.key,
          fileName: a.upload.fileName,
          mimeType: a.upload.mimeType,
          sizeBytes: a.upload.sizeBytes,
        })),
        createdAt: d.createdAt,
      })),
      events: agreement.events.map((e) => ({
        id: e.id,
        agreementId: e.agreementId,
        actorId: e.actorId,
        type: e.type,
        data: e.data,
        createdAt: e.createdAt,
      })),
      createdAt: agreement.createdAt,
      updatedAt: agreement.updatedAt,
    };
  }
}
