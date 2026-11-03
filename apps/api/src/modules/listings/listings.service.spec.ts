import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { listingCreateSchema, listingQuerySchema } from '@market/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../generated/prisma/client.js';
import { decodeCursor, encodeCursor } from './listings.cursor.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService, validatePriceRules } from './listings.service.js';
import { UserPresenter } from '../users/user.presenter.js';

describe('listings.cursor', () => {
  it('encodes and decodes cursors with different sort values', () => {
    const c1 = encodeCursor('newest', '2026-01-01T00:00:00.000Z', 'list-1');
    expect(decodeCursor(c1, 'newest')).toEqual({
      sortValue: '2026-01-01T00:00:00.000Z',
      id: 'list-1',
    });

    const c2 = encodeCursor('price_asc', 5000, 'list-2');
    expect(decodeCursor(c2, 'price_asc')).toEqual({
      sortValue: 5000,
      id: 'list-2',
    });

    const c3 = encodeCursor('ending_soon', null, 'list-3');
    expect(decodeCursor(c3, 'ending_soon')).toEqual({
      sortValue: null,
      id: 'list-3',
    });

    const c4 = encodeCursor('most_bids', 3, 'list-4');
    expect(decodeCursor(c4, 'most_bids')).toEqual({
      sortValue: 3,
      id: 'list-4',
    });

    const c5 = encodeCursor('relevance', 0.125, 'list-5');
    expect(decodeCursor(c5, 'relevance')).toEqual({
      sortValue: 0.125,
      id: 'list-5',
    });
  });

  it('rejects tampered and invalid cursors and does not fall back to plain IDs', () => {
    // Plain string id is rejected (no fallback)
    expect(() => decodeCursor('cuid1234567890', 'newest')).toThrow(BadRequestException);
    expect(() => decodeCursor('!!!not-valid-cursor!!!', 'newest')).toThrow(BadRequestException);

    // Missing id
    expect(() =>
      decodeCursor(
        Buffer.from(JSON.stringify({ s: 'newest', v: '2026-01-01T00:00:00.000Z' })).toString(
          'base64url',
        ),
        'newest',
      ),
    ).toThrow(BadRequestException);

    // Sort mismatch
    const cursorNewest = encodeCursor('newest', '2026-01-01T00:00:00.000Z', 'l1');
    expect(() => decodeCursor(cursorNewest, 'price_asc')).toThrow(BadRequestException);

    // Invalid ISO date for newest
    const cursorGarbageDate = Buffer.from(
      JSON.stringify({ s: 'newest', v: 'garbage', id: 'l1' }),
    ).toString('base64url');
    expect(() => decodeCursor(cursorGarbageDate, 'newest')).toThrow(BadRequestException);

    const cursorYearOverflow = Buffer.from(
      JSON.stringify({ s: 'newest', v: '99999-99-99', id: 'l1' }),
    ).toString('base64url');
    expect(() => decodeCursor(cursorYearOverflow, 'newest')).toThrow(BadRequestException);

    // Invalid types for price / most_bids
    const cursorBadPrice = Buffer.from(
      JSON.stringify({ s: 'price_asc', v: 'string-price', id: 'l1' }),
    ).toString('base64url');
    expect(() => decodeCursor(cursorBadPrice, 'price_asc')).toThrow(BadRequestException);

    const cursorBadBids = Buffer.from(JSON.stringify({ s: 'most_bids', v: -5, id: 'l1' })).toString(
      'base64url',
    );
    expect(() => decodeCursor(cursorBadBids, 'most_bids')).toThrow(BadRequestException);

    // Invalid number for relevance
    const cursorBadRel = Buffer.from(
      JSON.stringify({ s: 'relevance', v: 'nan', id: 'l1' }),
    ).toString('base64url');
    expect(() => decodeCursor(cursorBadRel, 'relevance')).toThrow(BadRequestException);

    // Int overflow numeric cursors capped at 2147483647
    for (const sort of ['price_asc', 'price_desc', 'most_bids'] as const) {
      for (const overflowVal of [99999999999, 9007199254740991]) {
        const c = Buffer.from(JSON.stringify({ s: sort, v: overflowVal, id: 'l1' })).toString(
          'base64url',
        );
        expect(() => decodeCursor(c, sort)).toThrow(BadRequestException);
      }
    }
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
      updateMany: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
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
      findFirst: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    listingAttachment: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
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
    invalidateCache: ReturnType<typeof vi.fn>;
  };

  const mockUser = { id: 'u1', role: 'USER' as const };
  const mockAdmin = { id: 'a1', role: 'ADMIN' as const };

  beforeEach(() => {
    prisma = {
      listing: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        delete: vi.fn(),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      category: { findUnique: vi.fn() },
      upload: { findMany: vi.fn() },
      bid: {
        count: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      listingImage: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        deleteMany: vi.fn(),
      },
      listingAttachment: {
        create: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
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
      invalidateCache: vi.fn().mockResolvedValue(undefined),
    };

    service = new ListingsService(
      prisma as never,
      storage as never,
      categoriesService as never,
      new UserPresenter(storage as never),
    );
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

    it('throws 409 when changing kind on listing with bids', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
        kind: 'REQUEST',
        priceType: 'FIXED',
        priceMinCents: 1000,
        priceMaxCents: null,
      });
      prisma.bid.count.mockResolvedValueOnce(1);

      await expect(service.update(mockUser, 'l1', { kind: 'OFFER' })).rejects.toThrow(
        new ConflictException('Cannot change kind on a listing that has bids'),
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

    it('throws 409 when attempting to reopen a CLOSED listing', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'CLOSED',
      });
      await expect(service.update(mockUser, 'l1', { status: 'OPEN' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws 409 when reverting an OPEN listing with bids to DRAFT', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
      });
      prisma.bid.count.mockResolvedValueOnce(2);

      await expect(service.update(mockUser, 'l1', { status: 'DRAFT' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('admin PATCH of someone else listing validates uploads against listing owner', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'other-user',
        status: 'OPEN',
        priceType: 'FIXED',
        priceMinCents: 1000,
        priceMaxCents: null,
      });
      // Upload belongs to other-user, not mockAdmin
      prisma.upload.findMany.mockResolvedValueOnce([
        { id: 'up1', uploaderId: 'other-user', status: 'READY', purpose: 'LISTING_IMAGE' },
      ]);
      vi.spyOn(service, 'getById').mockResolvedValueOnce({
        id: 'l1',
        title: 'Admin Edit',
      } as never);

      await expect(
        service.update(mockAdmin, 'l1', {
          imageIds: ['up1'],
        }),
      ).resolves.toBeDefined();
    });

    it('throws 409 when an upload is already attached to another listing', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
        priceType: 'FIXED',
        priceMinCents: 1000,
      });
      prisma.upload.findMany.mockResolvedValueOnce([
        { id: 'up1', uploaderId: 'u1', status: 'READY', purpose: 'LISTING_IMAGE' },
      ]);
      prisma.listingImage.findFirst.mockResolvedValueOnce({
        id: 'li2',
        listingId: 'other-listing',
        uploadId: 'up1',
      });

      await expect(service.update(mockUser, 'l1', { imageIds: ['up1'] })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects PATCH when image upload matches an existing attachment on the listing', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
        priceType: 'FIXED',
        priceMinCents: 1000,
        images: [],
        attachments: [{ uploadId: 'up-same' }],
      });

      await expect(service.update(mockUser, 'l1', { imageIds: ['up-same'] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects PATCH when attachment upload matches an existing image on the listing', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
        priceType: 'FIXED',
        priceMinCents: 1000,
        images: [{ uploadId: 'up-same' }],
        attachments: [],
      });

      await expect(service.update(mockUser, 'l1', { attachmentIds: ['up-same'] })).rejects.toThrow(
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
      expect(prisma.listing.updateMany).toHaveBeenCalledWith({
        where: { id: 'l1', status: 'OPEN' },
        data: { status: 'CLOSED' },
      });
      expect(prisma.bid.updateMany).toHaveBeenCalledWith({
        where: {
          listingId: 'l1',
          status: { in: ['PENDING', 'SHORTLISTED', 'COUNTERED'] },
        },
        data: { status: 'DECLINED' },
      });
      expect(categoriesService.invalidateCache).toHaveBeenCalled();
    });

    it('throws 409 if listing status changed concurrently during close', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
      });
      prisma.listing.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.close(mockUser, 'l1')).rejects.toThrow(ConflictException);
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

    it('throws 409 when deleting non-DRAFT listing races a new bid (Prisma P2003)', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
      });
      prisma.bid.count.mockResolvedValueOnce(0);
      prisma.listing.deleteMany.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
          code: 'P2003',
          clientVersion: '7.10.1',
        }),
      );

      await expect(service.delete(mockUser, 'l1')).rejects.toThrow(ConflictException);
    });

    it('allows deleting DRAFT listing and deletes bids and invalidates cache', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'DRAFT',
      });
      await service.delete(mockUser, 'l1');
      expect(prisma.bid.deleteMany).toHaveBeenCalledWith({ where: { listingId: 'l1' } });
      expect(prisma.listing.deleteMany).toHaveBeenCalledWith({
        where: { id: 'l1', status: 'DRAFT' },
      });
      expect(categoriesService.invalidateCache).toHaveBeenCalled();
    });

    it('allows deleting OPEN listing with 0 bids and NEVER calls bid.deleteMany', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
      });
      prisma.bid.count.mockResolvedValueOnce(0);

      await service.delete(mockUser, 'l1');
      expect(prisma.bid.deleteMany).not.toHaveBeenCalled();
      expect(prisma.listing.deleteMany).toHaveBeenCalledWith({
        where: { id: 'l1', status: 'OPEN' },
      });
      expect(categoriesService.invalidateCache).toHaveBeenCalled();
    });

    it('throws 409 when listing status changed concurrently during delete', async () => {
      prisma.listing.findUnique.mockResolvedValueOnce({
        id: 'l1',
        ownerId: 'u1',
        status: 'OPEN',
      });
      prisma.bid.count.mockResolvedValueOnce(0);
      prisma.listing.deleteMany.mockResolvedValueOnce({ count: 0 });

      await expect(service.delete(mockUser, 'l1')).rejects.toThrow(ConflictException);
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
      expect(res.categoryName).toBe('Tech');
      expect(res.thumbnailUrl).toBe('https://s3/file');
      expect(res.owner.avatarUrl).toBe('https://s3/file');
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
      const cursor = encodeCursor('price_asc', 1000, 'l0');
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'l1',
          ownerId: 'u1',
          categoryId: 'c1',
          categoryName: 'Tech',
          firstImageKey: 'image1.png',
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
          categoryName: 'Tech',
          firstImageKey: null,
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
      expect(res.items[0]?.categoryName).toBe('Tech');
      expect(res.items[0]?.thumbnailUrl).toBe('https://s3/file');
      expect(res.items[0]?.owner.avatarUrl).toBeNull();
      expect(res.nextCursor).toBeDefined();
    });

    it('handles price_desc, ending_soon, most_bids, and relevance sorts with cursors', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const cDesc = encodeCursor('price_desc', 5000, 'l1');
      await service.list(
        listingQuerySchema.parse({ sort: 'price_desc', cursor: cDesc, limit: 10 }),
      );

      const cEnding = encodeCursor('ending_soon', new Date().toISOString(), 'l1');
      await service.list(
        listingQuerySchema.parse({ sort: 'ending_soon', cursor: cEnding, limit: 10 }),
      );

      const cBids = encodeCursor('most_bids', 4, 'l1');
      await service.list(listingQuerySchema.parse({ sort: 'most_bids', cursor: cBids, limit: 10 }));

      const cRel = encodeCursor('relevance', 0.5, 'l1');
      await service.list(
        listingQuerySchema.parse({ q: 'market', sort: 'relevance', cursor: cRel, limit: 10 }),
      );

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
    });

    it('normalizes sort=relevance without q to newest', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const cNewest = encodeCursor('newest', new Date().toISOString(), 'l1');
      // When sort=relevance without q, it accepts the newest cursor and queries newest
      await service.list(
        listingQuerySchema.parse({ sort: 'relevance', cursor: cNewest, limit: 10 }),
      );

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
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
