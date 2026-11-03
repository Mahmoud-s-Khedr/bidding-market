import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../common/auth.js';
import { BidsService } from './bids.service.js';

type MockFn = ReturnType<typeof vi.fn>;

describe('BidsService', () => {
  let service: BidsService;
  let categoriesService: {
    invalidateCache: MockFn;
  };
  let prisma: {
    listing: {
      findUnique: MockFn;
      updateMany: MockFn;
    };
    bid: {
      findUnique: MockFn;
      findUniqueOrThrow: MockFn;
      findFirst: MockFn;
      findMany: MockFn;
      count: MockFn;
      create: MockFn;
      update: MockFn;
      updateMany: MockFn;
    };
    bidRevision: {
      create: MockFn;
      findFirst: MockFn;
    };
    bidAttachment: {
      createMany: MockFn;
      deleteMany: MockFn;
      findMany: MockFn;
    };
    upload: {
      findMany: MockFn;
    };
    agreement: {
      create: MockFn;
      findUniqueOrThrow: MockFn;
    };
    conversation: {
      findFirst: MockFn;
      create: MockFn;
      update: MockFn;
    };
    $transaction: MockFn;
    $queryRaw: MockFn;
  };
  let storage: {
    presignGet: MockFn;
  };
  let eventEmitter: {
    emit: MockFn;
  };

  const bidderUser: AuthUser = { id: 'u_bidder', role: 'USER' };
  const ownerUser: AuthUser = { id: 'u_owner', role: 'USER' };
  const thirdUser: AuthUser = { id: 'u_third', role: 'USER' };

  const mockPublicUser = (id: string, name: string) => ({
    id,
    displayName: name,
    avatarKey: null,
    bio: null,
    location: null,
    isBusiness: false,
    companyName: null,
    ratingAvg: 4.5,
    ratingCount: 10,
    completedCount: 5,
    createdAt: new Date(),
  });

  const mockListing = (status = 'OPEN', expiresAt: Date | null = null, kind = 'REQUEST') => ({
    id: 'list_1',
    ownerId: ownerUser.id,
    categoryId: 'cat_1',
    kind,
    status,
    title: 'Listing title',
    description: 'Detailed listing description',
    priceType: 'FIXED',
    priceMinCents: 10000,
    priceMaxCents: null,
    currency: 'USD',
    deliveryDays: 7,
    location: null,
    tags: [],
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: mockPublicUser(ownerUser.id, 'Owner'),
    category: { id: 'cat_1', name: 'Cat', slug: 'cat', parentId: null },
    _count: { bids: 1 },
  });

  const mockBid = (status = 'PENDING', amountCents = 8000, deliveryDays = 5) => ({
    id: 'bid_1',
    listingId: 'list_1',
    bidderId: bidderUser.id,
    amountCents,
    currency: 'USD',
    deliveryDays,
    message: 'Bid message',
    status,
    rejectReason: null,
    lastCounterById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    bidder: mockPublicUser(bidderUser.id, 'Bidder'),
    listing: mockListing(),
    attachments: [],
    revisions: [
      {
        id: 'rev_1',
        bidId: 'bid_1',
        authorId: bidderUser.id,
        amountCents,
        deliveryDays,
        message: 'Bid message',
        createdAt: new Date(),
        author: mockPublicUser(bidderUser.id, 'Bidder'),
      },
    ],
  });

  beforeEach(() => {
    prisma = {
      listing: {
        findUnique: vi.fn().mockImplementation(() => Promise.resolve(mockListing('OPEN'))),
        updateMany: vi.fn(),
      },
      bid: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn().mockImplementation(async () => {
          let b = mockBid();
          const lastFindUnique = prisma.bid.findUnique.mock.results.slice(-1)[0];
          if (lastFindUnique) {
            const val = (await lastFindUnique.value) as ReturnType<typeof mockBid> | undefined;
            if (val) b = { ...val };
          }
          const updateCall = prisma.bid.update.mock.calls.slice(-1)[0] as
            [{ data?: Partial<ReturnType<typeof mockBid>> }] | undefined;
          if (updateCall && updateCall[0]?.data) {
            b = { ...b, ...updateCall[0].data };
          }
          return b;
        }),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      bidRevision: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      bidAttachment: {
        createMany: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(),
      },
      upload: {
        findMany: vi.fn(),
      },
      agreement: {
        create: vi.fn(),
        findUniqueOrThrow: vi.fn().mockImplementation(() => {
          const lastCreated = prisma.agreement.create.mock.results.slice(-1)[0];
          if (lastCreated && lastCreated.value) {
            return Promise.resolve(lastCreated.value as object);
          }
          return Promise.resolve({
            id: 'ag_1',
            listingId: 'list_1',
            bidId: 'bid_1',
            buyerId: ownerUser.id,
            providerId: bidderUser.id,
            buyer: mockPublicUser(ownerUser.id, 'Owner'),
            provider: mockPublicUser(bidderUser.id, 'Bidder'),
            status: 'ACTIVE',
            milestones: [],
            deliverables: [],
            events: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }),
      },
      conversation: {
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
      $queryRaw: vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
        const sql = Array.isArray(strings) ? strings.join('') : String(strings);
        if (sql.includes('FROM "Listing"')) {
          const lastListing = prisma.listing.findUnique.mock.results.slice(-1)[0];
          if (lastListing) {
            const l = (await lastListing.value) as ReturnType<typeof mockListing> | null;
            if (!l || l.status !== 'OPEN') return [];
          }
          return [{ id: 'list_1' }];
        }
        if (sql.includes('FROM "Bid"')) {
          const lastBid = prisma.bid.findUnique.mock.results.slice(-1)[0];
          if (lastBid) {
            const b = (await lastBid.value) as ReturnType<typeof mockBid> | null;
            if (b) return [b];
          }
          return [mockBid()];
        }
        return [];
      }),
    };

    storage = {
      presignGet: vi.fn().mockResolvedValue('http://presigned-get-url'),
    };

    categoriesService = {
      invalidateCache: vi.fn().mockResolvedValue(undefined),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    service = new BidsService(
      prisma as never,
      storage as never,
      eventEmitter as never,
      categoriesService as never,
    );
  });

  describe('create', () => {
    it('throws NotFoundException if listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);

      await expect(
        service.create(
          'missing',
          { amountCents: 5000, deliveryDays: 3, message: 'bid', currency: 'USD' },
          bidderUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if listing is DRAFT and user is not owner', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('DRAFT'));

      await expect(
        service.create(
          'list_1',
          { amountCents: 5000, deliveryDays: 3, message: 'bid', currency: 'USD' },
          bidderUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if bidding on own listing', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('OPEN'));

      await expect(
        service.create(
          'list_1',
          { amountCents: 5000, deliveryDays: 3, message: 'bid', currency: 'USD' },
          ownerUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if listing is not OPEN', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('CLOSED'));

      await expect(
        service.create(
          'list_1',
          { amountCents: 5000, deliveryDays: 3, message: 'bid', currency: 'USD' },
          bidderUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if listing has expired', async () => {
      const expired = new Date(Date.now() - 10000);
      prisma.listing.findUnique.mockResolvedValue(mockListing('OPEN', expired));

      await expect(
        service.create(
          'list_1',
          { amountCents: 5000, deliveryDays: 3, message: 'bid', currency: 'USD' },
          bidderUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if user already has an active bid', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('OPEN'));
      prisma.bid.findFirst.mockResolvedValue({ id: 'active_bid' });

      await expect(
        service.create(
          'list_1',
          { amountCents: 5000, deliveryDays: 3, message: 'bid', currency: 'USD' },
          bidderUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if attachment is invalid', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('OPEN'));
      prisma.bid.findFirst.mockResolvedValue(null);
      prisma.upload.findMany.mockResolvedValue([]); // not found / not ready

      await expect(
        service.create(
          'list_1',
          {
            amountCents: 5000,
            deliveryDays: 3,
            message: 'bid',
            currency: 'USD',
            attachmentIds: ['bad_upload'],
          },
          bidderUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates bid, revision, attachments and emits event', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('OPEN'));
      prisma.bid.findFirst.mockResolvedValue(null);
      prisma.upload.findMany.mockResolvedValue([
        { id: 'att_1', status: 'READY', purpose: 'BID_ATTACHMENT', uploaderId: bidderUser.id },
      ]);
      prisma.bid.create.mockResolvedValue({ id: 'bid_new' });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({
        ...mockBid('PENDING', 5000, 3),
        id: 'bid_new',
      });

      const result = await service.create(
        'list_1',
        {
          amountCents: 5000,
          deliveryDays: 3,
          message: 'bid',
          currency: 'USD',
          attachmentIds: ['att_1'],
        },
        bidderUser,
      );

      expect(result.id).toBe('bid_new');
      expect(prisma.bid.create).toHaveBeenCalled();
      expect(prisma.bidRevision.create).toHaveBeenCalled();
      expect(prisma.bidAttachment.createMany).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('bid.created', expect.any(Object));
    });

    it('converts Prisma unique constraint violation (P2002) to ConflictException', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('OPEN'));
      prisma.bid.findFirst.mockResolvedValue(null);
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '7.10.1',
      });
      prisma.$transaction.mockRejectedValue(p2002);

      await expect(
        service.create(
          'list_1',
          { amountCents: 5000, deliveryDays: 3, message: 'bid', currency: 'USD' },
          bidderUser,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findByListing', () => {
    it('throws NotFoundException if listing not found', async () => {
      prisma.listing.findUnique.mockResolvedValue(null);

      await expect(
        service.findByListing('list_none', { sort: 'newest', limit: 20 }, ownerUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if non-owner has no bids on the listing', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('OPEN'));
      prisma.bid.count.mockResolvedValue(0);

      await expect(
        service.findByListing('list_1', { sort: 'newest', limit: 20 }, thirdUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns paginated bids for owner', async () => {
      prisma.listing.findUnique.mockResolvedValue(mockListing('OPEN'));
      prisma.$queryRaw.mockResolvedValue([
        {
          id: 'b1',
          listingId: 'list_1',
          bidderId: 'u_bidder',
          amountCents: 4000,
          currency: 'USD',
          deliveryDays: 2,
          message: 'bid',
          status: 'PENDING',
          rejectReason: null,
          lastCounterById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          bidder_id: 'u_bidder',
          bidder_displayName: 'Alice',
          bidder_avatarKey: null,
          bidder_bio: null,
          bidder_location: null,
          bidder_isBusiness: false,
          bidder_companyName: null,
          bidder_ratingAvg: 5.0,
          bidder_ratingCount: 1,
          bidder_completedCount: 1,
          bidder_createdAt: new Date(),
        },
      ]);
      prisma.bidAttachment.findMany.mockResolvedValue([]);

      const result = await service.findByListing(
        'list_1',
        { sort: 'amount_asc', limit: 20 },
        ownerUser,
      );
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.id).toBe('b1');
    });
  });

  describe('findMine', () => {
    it('returns user bids with listing summary', async () => {
      prisma.bid.findMany.mockResolvedValue([mockBid('PENDING')]);

      const result = await service.findMine({ limit: 20 }, bidderUser);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.listing.id).toBe('list_1');
    });
  });

  describe('findById', () => {
    it('throws NotFoundException if bid not found', async () => {
      prisma.bid.findUnique.mockResolvedValue(null);

      await expect(service.findById('bid_none', ownerUser)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if third user requests bid', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid());

      await expect(service.findById('bid_1', thirdUser)).rejects.toThrow(ForbiddenException);
    });

    it('allows bidder or owner to view bid detail', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid());

      const res = await service.findById('bid_1', bidderUser);
      expect(res.id).toBe('bid_1');
      expect(res.revisions).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('throws ForbiddenException if non-bidder edits', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid());

      await expect(service.update('bid_1', { amountCents: 9000 }, ownerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ConflictException if listing is not OPEN', async () => {
      const closedBid = {
        ...mockBid(),
        listing: mockListing('CLOSED'),
      };
      prisma.bid.findUnique.mockResolvedValue(closedBid);

      await expect(service.update('bid_1', { amountCents: 9000 }, bidderUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException if bid is in terminal status', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid('REJECTED'));

      await expect(service.update('bid_1', { amountCents: 9000 }, bidderUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('creates new revision and resets countered bid to PENDING', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid('COUNTERED'));
      prisma.bid.findUniqueOrThrow.mockResolvedValue(mockBid('PENDING', 9000));

      const res = await service.update('bid_1', { amountCents: 9000 }, bidderUser);
      expect(prisma.bidRevision.create).toHaveBeenCalled();
      expect(prisma.bid.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING', amountCents: 9000 }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('bid.updated', expect.any(Object));
      expect(res.status).toBe('PENDING');
    });
  });

  describe('withdraw', () => {
    it('throws ForbiddenException if non-bidder withdraws', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid());

      await expect(service.withdraw('bid_1', ownerUser)).rejects.toThrow(ForbiddenException);
    });

    it('updates status to WITHDRAWN and emits event', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid('PENDING'));
      prisma.bid.update.mockResolvedValue(mockBid('WITHDRAWN'));

      const res = await service.withdraw('bid_1', bidderUser);
      expect(res.status).toBe('WITHDRAWN');
      expect(eventEmitter.emit).toHaveBeenCalledWith('bid.withdrawn', expect.any(Object));
    });
  });

  describe('shortlist', () => {
    it('throws ForbiddenException if non-owner shortlists', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid());

      await expect(service.shortlist('bid_1', bidderUser)).rejects.toThrow(ForbiddenException);
    });

    it('updates status to SHORTLISTED', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid('PENDING'));
      prisma.bid.update.mockResolvedValue(mockBid('SHORTLISTED'));

      const res = await service.shortlist('bid_1', ownerUser);
      expect(res.status).toBe('SHORTLISTED');
    });
  });

  describe('reject', () => {
    it('throws ForbiddenException if non-owner rejects', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid());

      await expect(service.reject('bid_1', { reason: 'No' }, bidderUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('updates status to REJECTED with reason and emits event', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid('PENDING'));
      prisma.bid.update.mockResolvedValue({
        ...mockBid('REJECTED'),
        rejectReason: 'Too high',
      });

      const res = await service.reject('bid_1', { reason: 'Too high' }, ownerUser);
      expect(res.status).toBe('REJECTED');
      expect(res.rejectReason).toBe('Too high');
      expect(eventEmitter.emit).toHaveBeenCalledWith('bid.rejected', expect.any(Object));
    });
  });

  describe('counter', () => {
    it('throws ForbiddenException if non-owner counters', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid());

      await expect(
        service.counter(
          'bid_1',
          { amountCents: 7000, deliveryDays: 4, message: 'Deal?' },
          bidderUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates revision by owner, sets status COUNTERED, emits event', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid('PENDING'));
      prisma.bid.findUniqueOrThrow.mockResolvedValue({
        ...mockBid('COUNTERED', 8000),
        lastCounterById: ownerUser.id,
      });

      const res = await service.counter(
        'bid_1',
        { amountCents: 7000, deliveryDays: 4, message: 'Deal?' },
        ownerUser,
      );

      expect(prisma.bidRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorId: ownerUser.id,
            amountCents: 7000,
          }),
        }),
      );
      expect(prisma.bid.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COUNTERED',
            lastCounterById: ownerUser.id,
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('bid.countered', expect.any(Object));
      expect(res.status).toBe('COUNTERED');
    });
  });

  describe('accept and acceptCounter', () => {
    it('throws ForbiddenException if non-owner calls accept', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid('PENDING'));

      await expect(service.accept('bid_1', bidderUser)).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException on accept if listing update returns 0 rows (race condition)', async () => {
      prisma.bid.findUnique.mockResolvedValue(mockBid('PENDING'));
      prisma.listing.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.accept('bid_1', ownerUser)).rejects.toThrow(ConflictException);
    });

    it('executes acceptance flow for REQUEST listing (owner=buyer, bidder=provider)', async () => {
      const bid = mockBid('PENDING');
      prisma.bid.findUnique.mockResolvedValue(bid);
      prisma.listing.updateMany.mockResolvedValue({ count: 1 });
      prisma.bid.updateMany.mockResolvedValue({ count: 1 });
      prisma.agreement.create.mockResolvedValue({
        id: 'ag_1',
        listingId: 'list_1',
        bidId: 'bid_1',
        buyerId: ownerUser.id,
        providerId: bidderUser.id,
        buyer: mockPublicUser(ownerUser.id, 'Owner'),
        provider: mockPublicUser(bidderUser.id, 'Bidder'),
        status: 'ACTIVE',
        milestones: [],
        deliverables: [],
        events: [
          {
            id: 'ev_1',
            agreementId: 'ag_1',
            actorId: ownerUser.id,
            type: 'CREATED',
            data: null,
            createdAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv_1' });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({
        ...bid,
        status: 'ACCEPTED',
      });

      const res = await service.accept('bid_1', ownerUser);
      expect(res.bid.status).toBe('ACCEPTED');
      expect(res.agreement.buyer.id).toBe(ownerUser.id);
      expect(res.agreement.provider.id).toBe(bidderUser.id);
      expect(prisma.conversation.create).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('bid.accepted', expect.any(Object));
    });

    it('executes acceptance flow for OFFER listing (owner=provider, bidder=buyer)', async () => {
      const offerListing = mockListing('OPEN', null, 'OFFER');
      const bid = {
        ...mockBid('PENDING'),
        listing: offerListing,
      };
      prisma.bid.findUnique.mockResolvedValue(bid);
      prisma.listing.updateMany.mockResolvedValue({ count: 1 });
      prisma.bid.updateMany.mockResolvedValue({ count: 1 });
      prisma.agreement.create.mockResolvedValue({
        id: 'ag_2',
        listingId: 'list_1',
        bidId: 'bid_1',
        buyerId: bidderUser.id,
        providerId: ownerUser.id,
        buyer: mockPublicUser(bidderUser.id, 'Bidder'),
        provider: mockPublicUser(ownerUser.id, 'Owner'),
        status: 'ACTIVE',
        milestones: [],
        deliverables: [],
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.conversation.findFirst.mockResolvedValue({ id: 'existing_conv' });
      prisma.conversation.update.mockResolvedValue({ id: 'existing_conv' });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({
        ...bid,
        status: 'ACCEPTED',
      });

      const res = await service.accept('bid_1', ownerUser);
      expect(res.agreement.buyer.id).toBe(bidderUser.id);
      expect(res.agreement.provider.id).toBe(ownerUser.id);
      expect(prisma.conversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'existing_conv' },
          data: expect.objectContaining({ agreementId: 'ag_2' }),
        }),
      );
    });

    it('acceptCounter requires bidder and COUNTERED status with owner revision', async () => {
      const bid = {
        ...mockBid('COUNTERED'),
        lastCounterById: ownerUser.id,
      };
      prisma.bid.findUnique.mockResolvedValue(bid);
      prisma.bidRevision.findFirst.mockResolvedValue({
        id: 'rev_counter',
        bidId: 'bid_1',
        authorId: ownerUser.id,
        amountCents: 6500,
        deliveryDays: 3,
        message: 'Owner counter',
        createdAt: new Date(),
      });
      prisma.listing.updateMany.mockResolvedValue({ count: 1 });
      prisma.bid.updateMany.mockResolvedValue({ count: 1 });
      prisma.agreement.create.mockResolvedValue({
        id: 'ag_3',
        listingId: 'list_1',
        bidId: 'bid_1',
        buyerId: ownerUser.id,
        providerId: bidderUser.id,
        buyer: mockPublicUser(ownerUser.id, 'Owner'),
        provider: mockPublicUser(bidderUser.id, 'Bidder'),
        status: 'ACTIVE',
        milestones: [],
        deliverables: [],
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv_3' });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({
        ...bid,
        amountCents: 6500,
        deliveryDays: 3,
        status: 'ACCEPTED',
      });

      const res = await service.acceptCounter('bid_1', bidderUser);
      expect(res.bid.status).toBe('ACCEPTED');
      expect(res.bid.amountCents).toBe(6500);
      expect(res.bid.deliveryDays).toBe(3);
      expect(categoriesService.invalidateCache).toHaveBeenCalled();
      expect(prisma.bidRevision.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ seq: 'desc' }, { createdAt: 'desc' }],
        }),
      );
    });

    it('invalidates categories cache after successful accept', async () => {
      const bid = mockBid('PENDING');
      prisma.bid.findUnique.mockResolvedValue(bid);
      prisma.listing.updateMany.mockResolvedValue({ count: 1 });
      prisma.bid.updateMany.mockResolvedValue({ count: 1 });
      prisma.agreement.create.mockResolvedValue({
        id: 'ag_cache',
        listingId: 'list_1',
        bidId: 'bid_1',
        buyerId: ownerUser.id,
        providerId: bidderUser.id,
        buyer: mockPublicUser(ownerUser.id, 'Owner'),
        provider: mockPublicUser(bidderUser.id, 'Bidder'),
        status: 'ACTIVE',
        milestones: [],
        deliverables: [],
        events: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'conv_cache' });
      prisma.bid.findUniqueOrThrow.mockResolvedValue({
        ...bid,
        status: 'ACCEPTED',
      });

      await service.accept('bid_1', ownerUser);
      expect(categoriesService.invalidateCache).toHaveBeenCalled();
    });

    it('throws 409 ConflictException when currency changes concurrently before direct accept', async () => {
      const bid = mockBid('PENDING'); // currency is 'USD'
      prisma.bid.findUnique.mockResolvedValue(bid);
      prisma.listing.updateMany.mockResolvedValue({ count: 1 });
      // Locked bid returns changed currency 'EUR'
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          ...bid,
          currency: 'EUR',
        },
      ]);

      await expect(service.accept('bid_1', ownerUser)).rejects.toThrow(
        new ConflictException('Bid details have changed'),
      );
    });

    it('throws 409 ConflictException when currency changes concurrently before acceptCounter', async () => {
      const bid = {
        ...mockBid('COUNTERED'),
        currency: 'USD',
        lastCounterById: ownerUser.id,
      };
      prisma.bid.findUnique.mockResolvedValue(bid);
      prisma.bidRevision.findFirst.mockResolvedValue({
        id: 'rev_counter',
        bidId: 'bid_1',
        authorId: ownerUser.id,
        amountCents: 6500,
        deliveryDays: 3,
        message: 'Owner counter',
        createdAt: new Date(),
      });
      prisma.listing.updateMany.mockResolvedValue({ count: 1 });
      // Locked bid returns changed currency 'EUR'
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          ...bid,
          currency: 'EUR',
        },
      ]);

      await expect(service.acceptCounter('bid_1', bidderUser)).rejects.toThrow(
        new ConflictException('Bid details have changed'),
      );
    });

    it('throws 409 ConflictException when listing kind or status changes concurrently before accept', async () => {
      const bid = mockBid('PENDING');
      prisma.bid.findUnique.mockResolvedValue(bid);
      prisma.listing.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.accept('bid_1', ownerUser)).rejects.toThrow(
        new ConflictException('Listing is no longer open for acceptance'),
      );
      expect(prisma.listing.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: bid.listingId,
            status: 'OPEN',
            kind: bid.listing.kind,
          }),
        }),
      );
    });
  });
});
