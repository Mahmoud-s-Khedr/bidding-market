import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { listingCreateSchema, listingQuerySchema } from '@market/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeCursor, encodeCursor } from './listings.cursor.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService, validatePriceRules } from './listings.service.js';

describe('listings.cursor', () => {
  it('encodes and decodes cursors with different sort values', () => {
    const c1 = encodeCursor('2026-01-01T00:00:00.000Z', 'list-1');
    expect(decodeCursor(c1)).toEqual({
      sortValue: '2026-01-01T00:00:00.000Z',
      id: 'list-1',
    });

    const c2 = encodeCursor(5000, 'list-2');
    expect(decodeCursor(c2)).toEqual({
      sortValue: 5000,
      id: 'list-2',
    });

    const c3 = encodeCursor(null, 'list-3');
    expect(decodeCursor(c3)).toEqual({
      sortValue: null,
      id: 'list-3',
    });
  });

  it('handles plain string IDs as fallback and rejects invalid cursors', () => {
    expect(decodeCursor('cuid1234567890')).toEqual({
      sortValue: null,
      id: 'cuid1234567890',
    });

    expect(() => decodeCursor('!!!not-valid-cursor!!!')).toThrow(BadRequestException);
    expect(() =>
      decodeCursor(Buffer.from(JSON.stringify({ v: 'test' })).toString('base64url')),
    ).toThrow(BadRequestException);
  });
});

describe('validatePriceRules', () => {
  it('validates FIXED price rules', () => {
    expect(() => validatePriceRules('FIXED', 1000, null)).not.toThrow();
    expect(() => validatePriceRules('FIXED', null, null)).toThrow(BadRequestException);
    expect(() => validatePriceRules('FIXED', 1000, 2000)).toThrow(BadRequestException);
  });

  it('validates RANGE price rules', () => {
    expect(() => validatePriceRules('RANGE', 1000, 2000)).not.toThrow();
    expect(() => validatePriceRules('RANGE', 1000, null)).toThrow(BadRequestException);
    expect(() => validatePriceRules('RANGE', null, 2000)).toThrow(BadRequestException);
    expect(() => validatePriceRules('RANGE', 2000, 1000)).toThrow(BadRequestException);
  });

  it('validates NEGOTIABLE price rules', () => {
    expect(() => validatePriceRules('NEGOTIABLE', null, null)).not.toThrow();
    expect(() => validatePriceRules('NEGOTIABLE', 1000, null)).toThrow(BadRequestException);
    expect(() => validatePriceRules('NEGOTIABLE', null, 2000)).toThrow(BadRequestException);
  });
});

describe('ListingsService', () => {
  let service: ListingsService;
  let prisma: {
    listing: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    category: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    upload: {
      findMany: ReturnType<typeof vi.fn>;
    };
    bid: {
      count: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    listingImage: {
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    listingAttachment: {
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
  };
  let storage: {
    presignGet: ReturnType<typeof vi.fn>;
  };
  let categoriesService: {
    getDescendantCategoryIds: ReturnType<typeof vi.fn>;
  };

  const mockUser = { id: 'u1', role: 'USER' as const };
  const mockAdmin = { id: 'a1', role: 'ADMIN' as const };

  beforeEach(() => {
    prisma = {
      listing: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      category: { findUnique: vi.fn() },
      upload: { findMany: vi.fn() },
      bid: {
        count: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      listingImage: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      listingAttachment: {
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
      $queryRaw: vi.fn(),
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    storage = {
      presignGet: vi.fn().mockResolvedValue('https://s3/file'),
    };
    categoriesService = {
      getDescendantCategoryIds: vi.fn().mockResolvedValue([]),
    };

    service = new ListingsService(prisma as never, storage as never, categoriesService as never);
  });

  describe('create', () => {
    it('throws 400 when category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create(
          'u1',
          listingCreateSchema.parse({
            kind: 'REQUEST',
            title: 'A long enough title',
            description: 'A sufficiently long description for the listing',
            categoryId: 'missing',
            priceType: 'NEGOTIABLE',
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when attached upload does not belong to user or wrong purpose', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'cat1' });
      prisma.upload.findMany.mockResolvedValueOnce([
        { id: 'up1', uploaderId: 'other', status: 'READY', purpose: 'LISTING_IMAGE' },
      ]);

      await expect(
        service.create(
          'u1',
          listingCreateSchema.parse({
            kind: 'REQUEST',
            title: 'A long enough title',
            description: 'A sufficiently long description for the listing',
            categoryId: 'cat1',
            priceType: 'FIXED',
            priceMinCents: 1000,
            imageIds: ['up1'],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates listing and relations successfully', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'cat1' });
      prisma.upload.findMany.mockResolvedValueOnce([
        { id: 'up1', uploaderId: 'u1', status: 'READY', purpose: 'LISTING_IMAGE' },
      ]);
      prisma.listing.create.mockResolvedValueOnce({ id: 'l1' });

      // For getById call inside create:
      vi.spyOn(service, 'getById').mockResolvedValueOnce({ id: 'l1' } as never);

      const res = await service.create(
        'u1',
        listingCreateSchema.parse({
          kind: 'REQUEST',
          title: 'A long enough title',
          description: 'A sufficiently long description for the listing',
          categoryId: 'cat1',
          priceType: 'FIXED',
          priceMinCents: 1000,
          imageIds: ['up1'],
        }),
      );

      expect(res.id).toBe('l1');
      expect(prisma.listingImage.create).toHaveBeenCalledWith({
        data: { listingId: 'l1', uploadId: 'up1', position: 0 },
      });
    });
  });

  describe('update', () => {
    it('throws 404 when listing does not exist', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce(null);
      await expect(service.update(mockUser, 'l1', { title: 'New title' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 403 when non-owner non-admin updates', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({ id: 'l1', ownerId: 'other' });
      await expect(service.update(mockUser, 'l1', { title: 'New title' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws 409 when listing is IN_PROGRESS, COMPLETED, or REMOVED', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'IN_PROGRESS',
      });
      await expect(service.update(mockUser, 'l1', { title: 'New title' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('updates listing successfully and returns detail', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
        priceType: 'FIXED',
        priceMinCents: 1000,
        priceMaxCents: null,
      });
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c2' });
      prisma.upload.findMany
        .mockResolvedValueOnce([
          { id: 'up1', uploaderId: 'u1', status: 'READY', purpose: 'LISTING_IMAGE' },
        ])
        .mockResolvedValueOnce([
          { id: 'att1', uploaderId: 'u1', status: 'READY', purpose: 'LISTING_ATTACHMENT' },
        ]);
      vi.spyOn(service, 'getById').mockResolvedValueOnce({ id: 'l1', title: 'Updated' } as never);

      const res = await service.update(mockUser, 'l1', {
        title: 'Updated',
        categoryId: 'c2',
        imageIds: ['up1'],
        attachmentIds: ['att1'],
      });
      expect(res.title).toBe('Updated');
      expect(prisma.listingImage.deleteMany).toHaveBeenCalledWith({ where: { listingId: 'l1' } });
      expect(prisma.listingAttachment.deleteMany).toHaveBeenCalledWith({
        where: { listingId: 'l1' },
      });
    });

    it('throws 400 when updating with nonexistent categoryId', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
        priceType: 'NEGOTIABLE',
      });
      prisma.category.findUnique.mockResolvedValueOnce(null);

      await expect(service.update(mockUser, 'l1', { categoryId: 'nonexistent' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('close', () => {
    it('throws 409 if listing is not OPEN', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'CLOSED',
      });
      await expect(service.close(mockUser, 'l1')).rejects.toThrow(ConflictException);
    });

    it('closes OPEN listing and declines active bids in transaction', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
      });
      vi.spyOn(service, 'getById').mockResolvedValueOnce({ id: 'l1', status: 'CLOSED' } as never);

      const res = await service.close(mockUser, 'l1');
      expect(res.status).toBe('CLOSED');
      expect(prisma.listing.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { status: 'CLOSED' },
      });
      expect(prisma.bid.updateMany).toHaveBeenCalledWith({
        where: {
          listingId: 'l1',
          status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] },
        },
        data: { status: 'DECLINED' },
      });
    });
  });

  describe('delete', () => {
    it('throws 409 when deleting non-DRAFT listing that has bids', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
      });
      prisma.bid.count.mockResolvedValueOnce(3);

      await expect(service.delete(mockUser, 'l1')).rejects.toThrow(ConflictException);
    });

    it('allows deleting DRAFT listing even if it had bids', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'DRAFT',
      });
      await service.delete(mockUser, 'l1');
      expect(prisma.listing.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    });

    it('allows deleting OPEN listing with 0 bids', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
      });
      prisma.bid.count.mockResolvedValueOnce(0);

      await service.delete(mockUser, 'l1');
      expect(prisma.listing.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    });
  });

  describe('getById', () => {
    const listingData = {
      id: 'l1',
      ownerId: 'u1',
      categoryId: 'c1',
      kind: 'REQUEST',
      status: 'OPEN',
      title: 'Listing title',
      description: 'Listing description',
      priceType: 'FIXED',
      priceMinCents: 1000,
      priceMaxCents: null,
      currency: 'USD',
      deliveryDays: 3,
      location: 'Remote',
      tags: ['tag'],
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      owner: {
        id: 'u1',
        displayName: 'Alice',
        avatarKey: 'avatar.png',
        bio: null,
        location: null,
        isBusiness: false,
        companyName: null,
        ratingAvg: 5,
        ratingCount: 1,
        completedCount: 1,
        createdAt: new Date(),
      },
      category: { id: 'c1', name: 'Tech', slug: 'tech', parentId: null },
      images: [
        {
          upload: {
            id: 'up1',
            key: 'k1',
            fileName: 'i.png',
            mimeType: 'image/png',
            sizeBytes: 100,
          },
        },
      ],
      attachments: [],
      _count: { bids: 2 },
    };

    it('returns detail for public listing', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce(listingData);

      const res = await service.getById('l1');
      expect(res.id).toBe('l1');
      expect(res.bidCount).toBe(2);
      expect(res.myBid).toBeNull();
      expect(res.images[0]?.url).toBe('https://s3/file');
    });

    it('hides DRAFT listing from anonymous and other users with 404', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({ ...listingData, status: 'DRAFT' });
      await expect(service.getById('l1')).rejects.toThrow(NotFoundException);

      prisma.listing.findUnique.mockResolvedValueOnce({ ...listingData, status: 'DRAFT' });
      await expect(service.getById('l1', { id: 'other', role: 'USER' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows owner and admin to view DRAFT listing', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({ ...listingData, status: 'DRAFT' });
      const resOwner = await service.getById('l1', mockUser);
      expect(resOwner.status).toBe('DRAFT');

      prisma.listing.findUnique.mockResolvedValueOnce({ ...listingData, status: 'DRAFT' });
      const resAdmin = await service.getById('l1', mockAdmin);
      expect(resAdmin.status).toBe('DRAFT');
    });

    it('includes user bid when authed', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce(listingData);
      prisma.bid.findFirst.mockResolvedValueOnce({
        id: 'b1',
        listingId: 'l1',
        bidderId: 'u1',
        amountCents: 900,
        currency: 'USD',
        deliveryDays: 2,
        message: 'my bid',
        status: 'PENDING',
        rejectReason: null,
        lastCounterById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        bidder: listingData.owner,
      });

      const res = await service.getById('l1', mockUser);
      expect(res.myBid).toBeDefined();
      expect(res.myBid?.amountCents).toBe(900);
    });
  });

  describe('list', () => {
    it('throws 401 when ownerId=me and unauthenticated', async () => {
      await expect(
        service.list(listingQuerySchema.parse({ ownerId: 'me', limit: 10 })),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws 403 when non-admin requests DRAFT status without ownerId=me', async () => {
      await expect(
        service.list(listingQuerySchema.parse({ status: 'DRAFT', limit: 10 }), mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns empty when category not found', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      const res = await service.list(
        listingQuerySchema.parse({ categoryId: 'nonexistent', limit: 10 }),
      );
      expect(res.items).toEqual([]);
      expect(res.nextCursor).toBeNull();
    });

    it('queries listings with category, kind, price, location, currency, ownerId=me', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1', slug: 'tech' });
      categoriesService.getDescendantCategoryIds.mockResolvedValueOnce(['c2']);
      prisma.$queryRaw.mockResolvedValueOnce([]);

      await service.list(
        listingQuerySchema.parse({
          categoryId: 'c1',
          kind: 'OFFER',
          minPrice: 500,
          maxPrice: 2000,
          currency: 'USD',
          location: 'San Francisco',
          ownerId: 'me',
          status: 'DRAFT',
          limit: 10,
        }),
        mockUser,
      );

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('handles categorySlug and specific ownerId for admin', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'c1', slug: 'tech' });
      categoriesService.getDescendantCategoryIds.mockResolvedValueOnce([]);
      prisma.$queryRaw.mockResolvedValueOnce([]);

      await service.list(
        listingQuerySchema.parse({
          categorySlug: 'tech',
          ownerId: 'other-user',
          status: 'DRAFT',
          limit: 10,
        }),
        mockAdmin,
      );

      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('handles price_asc sort and cursor', async () => {
      const cursor = encodeCursor(1000, 'l0');
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'l1',
          ownerId: 'u1',
          categoryId: 'c1',
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Listing 1',
          priceType: 'FIXED',
          priceMinCents: 1500,
          priceMaxCents: null,
          currency: 'USD',
          location: null,
          expiresAt: null,
          createdAt: new Date(),
          bidCount: 0,
          owner_id: 'u1',
          owner_displayName: 'Alice',
          owner_avatarKey: null,
          owner_bio: null,
          owner_location: null,
          owner_isBusiness: false,
          owner_companyName: null,
          owner_ratingAvg: 0,
          owner_ratingCount: 0,
          owner_completedCount: 0,
          owner_createdAt: new Date(),
        },
        {
          id: 'l2',
          ownerId: 'u1',
          categoryId: 'c1',
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Listing 2',
          priceType: 'FIXED',
          priceMinCents: 2000,
          priceMaxCents: null,
          currency: 'USD',
          location: null,
          expiresAt: null,
          createdAt: new Date(),
          bidCount: 0,
          owner_id: 'u1',
          owner_displayName: 'Alice',
          owner_avatarKey: null,
          owner_bio: null,
          owner_location: null,
          owner_isBusiness: false,
          owner_companyName: null,
          owner_ratingAvg: 0,
          owner_ratingCount: 0,
          owner_completedCount: 0,
          owner_createdAt: new Date(),
        },
      ]);

      const res = await service.list(
        listingQuerySchema.parse({ sort: 'price_asc', cursor, limit: 1 }),
      );
      expect(res.items).toHaveLength(1);
      expect(res.nextCursor).toBeDefined();
    });

    it('handles price_desc, ending_soon, most_bids, and relevance sorts with cursors', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const cDesc = encodeCursor(5000, 'l1');
      await service.list(
        listingQuerySchema.parse({ sort: 'price_desc', cursor: cDesc, limit: 10 }),
      );

      const cEnding = encodeCursor(new Date().toISOString(), 'l1');
      await service.list(
        listingQuerySchema.parse({ sort: 'ending_soon', cursor: cEnding, limit: 10 }),
      );

      const cBids = encodeCursor(4, 'l1');
      await service.list(listingQuerySchema.parse({ sort: 'most_bids', cursor: cBids, limit: 10 }));

      const cRel = encodeCursor(0.5, 'l1');
      await service.list(
        listingQuerySchema.parse({ q: 'market', sort: 'relevance', cursor: cRel, limit: 10 }),
      );

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    });
  });

  describe('ListingsController', () => {
    it('delegates all controller methods', async () => {
      vi.spyOn(service, 'list').mockResolvedValueOnce({ items: [], nextCursor: null });
      vi.spyOn(service, 'getById').mockResolvedValueOnce({ id: 'l1' } as never);
      vi.spyOn(service, 'create').mockResolvedValueOnce({ id: 'l1' } as never);
      vi.spyOn(service, 'update').mockResolvedValueOnce({ id: 'l1' } as never);
      vi.spyOn(service, 'close').mockResolvedValueOnce({ id: 'l1' } as never);
      vi.spyOn(service, 'delete').mockResolvedValueOnce(undefined);

      const controller = new ListingsController(service);

      expect(await controller.list(mockUser, { limit: 10 })).toEqual({
        items: [],
        nextCursor: null,
      });
      expect(await controller.getById(mockUser, { id: 'l1' })).toEqual({ id: 'l1' });
      expect(await controller.create(mockUser, { title: 'x' })).toEqual({ id: 'l1' });
      expect(await controller.update(mockUser, { id: 'l1' }, { title: 'y' })).toEqual({
        id: 'l1',
      });
      expect(await controller.close(mockUser, { id: 'l1' })).toEqual({ id: 'l1' });
      expect(await controller.delete(mockUser, { id: 'l1' })).toBeUndefined();
    });
  });
});
