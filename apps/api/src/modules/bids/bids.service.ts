import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
  PublicUser,
} from '@market/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../common/auth.js';
import { paginate, type PaginatedResult } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
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

export const publicUserSelect = {
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
} as const;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
              orderBy: { createdAt: 'asc' },
            },
          },
        });
      });

      const detail = await this.mapBidDetail(bid);
      this.eventEmitter.emit(BID_EVENTS.CREATED, new BidCreatedEvent(detail, user.id));
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
      if (myBidsCount === 0) {
        throw new ForbiddenException('You do not have access to bids on this listing');
      }
    }

    const sort: BidSort = query.sort ?? 'newest';
    const conditions: Prisma.Sql[] = [Prisma.sql`b."listingId" = ${listingId}`];

    if (!isOwner && !isAdmin) {
      conditions.push(Prisma.sql`b."bidderId" = ${user.id}`);
    }

    if (query.status) {
      conditions.push(Prisma.sql`b.status = ${query.status}::"BidStatus"`);
    }

    if (query.cursor) {
      const decoded = decodeBidCursor(query.cursor);
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

    const rows = await this.prisma.$queryRaw<RawBidRow[]>(Prisma.sql`
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
      WHERE ${Prisma.join(conditions, ' AND ')}
      ${orderByClause}
      LIMIT ${take}
    `);

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
        return {
          id: row.id,
          listingId: row.listingId,
          bidder: {
            id: row.bidder_id,
            displayName: row.bidder_displayName,
            avatarUrl: row.bidder_avatarKey,
            bio: row.bidder_bio,
            location: row.bidder_location,
            isBusiness: row.bidder_isBusiness,
            companyName: row.bidder_companyName,
            ratingAvg: row.bidder_ratingAvg,
            ratingCount: row.bidder_ratingCount,
            completedCount: row.bidder_completedCount,
            createdAt: row.bidder_createdAt,
          },
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
        nextCursor = encodeBidCursor(sortValue, lastRow.id);
      }
    }

    return { items, nextCursor };
  }

  async findMine(
    query: MyBidsQueryInput,
    user: AuthUser,
  ): Promise<PaginatedResult<BidWithListing>> {
    const limit = query.limit ?? 20;

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
        return {
          id: bid.id,
          listingId: bid.listingId,
          bidder: this.mapPublicUser(bid.bidder),
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
          listing: {
            id: bid.listing.id,
            owner: this.mapPublicUser(bid.listing.owner),
            categoryId: bid.listing.categoryId,
            category: {
              id: bid.listing.category.id,
              name: bid.listing.category.name,
              slug: bid.listing.category.slug,
              parentId: bid.listing.category.parentId,
            },
            kind: bid.listing.kind,
            status: bid.listing.status,
            title: bid.listing.title,
            description: bid.listing.description,
            priceType: bid.listing.priceType,
            priceMinCents: bid.listing.priceMinCents,
            priceMaxCents: bid.listing.priceMaxCents,
            currency: bid.listing.currency,
            deliveryDays: bid.listing.deliveryDays,
            location: bid.listing.location,
            tags: bid.listing.tags,
            expiresAt: bid.listing.expiresAt,
            bidCount: bid.listing._count.bids,
            createdAt: bid.listing.createdAt,
            updatedAt: bid.listing.updatedAt,
          },
        };
      }),
    );

    return {
      items,
      nextCursor: paginated.nextCursor,
    };
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
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
    const bid = await this.prisma.bid.findUnique({
      where: { id },
      include: {
        listing: true,
      },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.bidderId !== user.id) {
      throw new ForbiddenException('Only the bidder can edit this bid');
    }

    const nextStatus = assertBidTransition(bid.status, 'EDIT', 'bidder');

    if (bid.listing.status !== 'OPEN') {
      throw new ConflictException('Listing is no longer open');
    }

    if (bid.listing.expiresAt && bid.listing.expiresAt < new Date()) {
      throw new ConflictException('Listing has expired');
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
      const newAmount = input.amountCents ?? bid.amountCents;
      const newDelivery = input.deliveryDays ?? bid.deliveryDays;
      const newMessage = input.message ?? bid.message;
      const newCurrency = input.currency ?? bid.currency;

      await tx.bidRevision.create({
        data: {
          bidId: bid.id,
          authorId: user.id,
          amountCents: newAmount,
          deliveryDays: newDelivery,
          message: newMessage,
        },
      });

      if (input.attachmentIds !== undefined) {
        await tx.bidAttachment.deleteMany({ where: { bidId: bid.id } });
        if (input.attachmentIds.length > 0) {
          await tx.bidAttachment.createMany({
            data: input.attachmentIds.map((uploadId: string) => ({
              bidId: bid.id,
              uploadId,
            })),
          });
        }
      }

      await tx.bid.update({
        where: { id: bid.id },
        data: {
          amountCents: newAmount,
          currency: newCurrency,
          deliveryDays: newDelivery,
          message: newMessage,
          status: nextStatus,
        },
      });

      return tx.bid.findUniqueOrThrow({
        where: { id: bid.id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
    });

    const detail = await this.mapBidDetail(updated);
    this.eventEmitter.emit(BID_EVENTS.UPDATED, new BidUpdatedEvent(detail, user.id));
    return detail;
  }

  async withdraw(id: string, user: AuthUser): Promise<BidDetail> {
    const bid = await this.prisma.bid.findUnique({
      where: { id },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.bidderId !== user.id) {
      throw new ForbiddenException('Only the bidder can withdraw this bid');
    }

    const nextStatus = assertBidTransition(bid.status, 'WITHDRAW', 'bidder');

    const updated = await this.prisma.bid.update({
      where: { id },
      data: { status: nextStatus },
      include: {
        bidder: { select: publicUserSelect },
        attachments: { include: { upload: true } },
        revisions: {
          include: { author: { select: publicUserSelect } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    const detail = await this.mapBidDetail(updated);
    this.eventEmitter.emit(BID_EVENTS.WITHDRAWN, new BidWithdrawnEvent(detail, user.id));
    return detail;
  }

  async shortlist(id: string, user: AuthUser): Promise<BidDetail> {
    const bid = await this.prisma.bid.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.listing.ownerId !== user.id) {
      throw new ForbiddenException('Only the listing owner can shortlist a bid');
    }

    if (bid.listing.status !== 'OPEN') {
      throw new ConflictException('Listing is no longer open');
    }

    const nextStatus = assertBidTransition(bid.status, 'SHORTLIST', 'owner');

    const updated = await this.prisma.bid.update({
      where: { id },
      data: { status: nextStatus },
      include: {
        bidder: { select: publicUserSelect },
        attachments: { include: { upload: true } },
        revisions: {
          include: { author: { select: publicUserSelect } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    return this.mapBidDetail(updated);
  }

  async reject(id: string, input: { reason?: string }, user: AuthUser): Promise<BidDetail> {
    const bid = await this.prisma.bid.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.listing.ownerId !== user.id) {
      throw new ForbiddenException('Only the listing owner can reject a bid');
    }

    const nextStatus = assertBidTransition(bid.status, 'REJECT', 'owner');

    const updated = await this.prisma.bid.update({
      where: { id },
      data: {
        status: nextStatus,
        rejectReason: input.reason ?? null,
      },
      include: {
        bidder: { select: publicUserSelect },
        attachments: { include: { upload: true } },
        revisions: {
          include: { author: { select: publicUserSelect } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    const detail = await this.mapBidDetail(updated);
    this.eventEmitter.emit(
      BID_EVENTS.REJECTED,
      new BidRejectedEvent(detail, user.id, input.reason ?? null),
    );
    return detail;
  }

  async counter(id: string, input: BidCounterInput, user: AuthUser): Promise<BidDetail> {
    const bid = await this.prisma.bid.findUnique({
      where: { id },
      include: { listing: true },
    });

    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    if (bid.listing.ownerId !== user.id) {
      throw new ForbiddenException('Only the listing owner can counter a bid');
    }

    if (bid.listing.status !== 'OPEN') {
      throw new ConflictException('Listing is no longer open');
    }

    const nextStatus = assertBidTransition(bid.status, 'COUNTER', 'owner');

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.bidRevision.create({
        data: {
          bidId: bid.id,
          authorId: user.id,
          amountCents: input.amountCents,
          deliveryDays: input.deliveryDays,
          message: input.message,
        },
      });

      await tx.bid.update({
        where: { id: bid.id },
        data: {
          status: nextStatus,
          lastCounterById: user.id,
        },
      });

      return tx.bid.findUniqueOrThrow({
        where: { id: bid.id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
    });

    const detail = await this.mapBidDetail(updated);
    this.eventEmitter.emit(BID_EVENTS.COUNTERED, new BidCounteredEvent(detail, user.id));
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

    return this.executeAcceptanceFlow(bid, bid.amountCents, bid.deliveryDays, user);
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
      orderBy: { createdAt: 'desc' },
    });

    if (!lastCounterRevision) {
      throw new ConflictException('Counter revision not found');
    }

    return this.executeAcceptanceFlow(
      bid,
      lastCounterRevision.amountCents,
      lastCounterRevision.deliveryDays,
      user,
    );
  }

  private async executeAcceptanceFlow(
    bid: Prisma.BidGetPayload<{ include: { listing: true } }>,
    finalAmountCents: number,
    finalDeliveryDays: number,
    actor: AuthUser,
  ): Promise<BidAcceptResponse> {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Conditional update on listing: OPEN -> IN_PROGRESS
      const listingUpdate = await tx.listing.updateMany({
        where: { id: bid.listingId, status: 'OPEN' },
        data: { status: 'IN_PROGRESS' },
      });

      if (listingUpdate.count === 0) {
        throw new ConflictException('Listing is no longer open for acceptance');
      }

      // 2. Conditional update on bid: status must be active
      const bidUpdate = await tx.bid.updateMany({
        where: {
          id: bid.id,
          status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] },
        },
        data: {
          status: 'ACCEPTED',
          amountCents: finalAmountCents,
          deliveryDays: finalDeliveryDays,
        },
      });

      if (bidUpdate.count === 0) {
        throw new ConflictException('Bid is not in an acceptable status');
      }

      // 3. Decline all other active bids on this listing
      await tx.bid.updateMany({
        where: {
          listingId: bid.listingId,
          id: { not: bid.id },
          status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] },
        },
        data: { status: 'DECLINED' },
      });

      // 4. Role derivation:
      // REQUEST listing: owner = buyer, bidder = provider
      // OFFER listing: owner = provider, bidder = buyer
      const isRequest = bid.listing.kind === 'REQUEST';
      const buyerId = isRequest ? bid.listing.ownerId : bid.bidderId;
      const providerId = isRequest ? bid.bidderId : bid.listing.ownerId;

      // 5. Create Agreement & AgreementEvent CREATED
      const agreement = await tx.agreement.create({
        data: {
          listingId: bid.listingId,
          bidId: bid.id,
          buyerId,
          providerId,
          status: 'ACTIVE',
          events: {
            create: {
              type: 'CREATED',
              actorId: actor.id,
            },
          },
        },
        include: {
          buyer: { select: publicUserSelect },
          provider: { select: publicUserSelect },
          events: true,
          milestones: true,
          deliverables: {
            include: {
              attachments: { include: { upload: true } },
            },
          },
        },
      });

      // 6. Reuse or create Conversation linked to listing/bid/agreement
      const existingConv = await tx.conversation.findFirst({
        where: {
          listingId: bid.listingId,
          participants: {
            some: { userId: bid.listing.ownerId },
          },
          AND: [
            {
              participants: {
                some: { userId: bid.bidderId },
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
            bidId: bid.id,
          },
        });
      } else {
        await tx.conversation.create({
          data: {
            listingId: bid.listingId,
            bidId: bid.id,
            agreementId: agreement.id,
            participants: {
              create: [{ userId: bid.listing.ownerId }, { userId: bid.bidderId }],
            },
          },
        });
      }

      const updatedBid = await tx.bid.findUniqueOrThrow({
        where: { id: bid.id },
        include: {
          bidder: { select: publicUserSelect },
          attachments: { include: { upload: true } },
          revisions: {
            include: { author: { select: publicUserSelect } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });

      return { updatedBid, agreement };
    });

    const serializedBid = await this.mapBidDetail(result.updatedBid);
    const serializedAgreement = this.mapAgreement(result.agreement);

    this.eventEmitter.emit(
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

  private mapPublicUser(user: {
    id: string;
    displayName: string;
    avatarKey: string | null;
    bio: string | null;
    location: string | null;
    isBusiness: boolean;
    companyName: string | null;
    ratingAvg: number;
    ratingCount: number;
    completedCount: number;
    createdAt: Date;
  }): PublicUser {
    return {
      id: user.id,
      displayName: user.displayName,
      avatarUrl: user.avatarKey,
      bio: user.bio,
      location: user.location,
      isBusiness: user.isBusiness,
      companyName: user.companyName,
      ratingAvg: user.ratingAvg,
      ratingCount: user.ratingCount,
      completedCount: user.completedCount,
      createdAt: user.createdAt,
    };
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
    const revisions = bid.revisions.map((r) => ({
      id: r.id,
      bidId: r.bidId,
      authorId: r.authorId,
      author: r.author ? this.mapPublicUser(r.author) : undefined,
      amountCents: r.amountCents,
      deliveryDays: r.deliveryDays,
      message: r.message,
      createdAt: r.createdAt,
    }));

    return {
      id: bid.id,
      listingId: bid.listingId,
      bidder: this.mapPublicUser(bid.bidder),
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

  private mapAgreement(
    agreement: Prisma.AgreementGetPayload<{
      include: {
        buyer: { select: typeof publicUserSelect };
        provider: { select: typeof publicUserSelect };
        events: true;
        milestones: true;
        deliverables: { include: { attachments: { include: { upload: true } } } };
      };
    }>,
  ): Agreement {
    return {
      id: agreement.id,
      listingId: agreement.listingId,
      bidId: agreement.bidId,
      buyer: this.mapPublicUser(agreement.buyer),
      provider: this.mapPublicUser(agreement.provider),
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
