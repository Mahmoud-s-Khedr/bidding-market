import { describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AgreementsService, canTransitionMilestone, roleFor } from './agreements.service.js';
import { Prisma } from '../../generated/prisma/client.js';

describe('agreement transition rules', () => {
  it('derives a role only for participants', () => {
    expect(roleFor({ buyerId: 'b', providerId: 'p' }, 'b')).toBe('buyer');
    expect(roleFor({ buyerId: 'b', providerId: 'p' }, 'p')).toBe('provider');
    expect(roleFor({ buyerId: 'b', providerId: 'p' }, 'x')).toBeNull();
  });

  it('only permits monotonic milestone transitions', () => {
    expect(canTransitionMilestone('PENDING', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionMilestone('IN_PROGRESS', 'DONE')).toBe(true);
    expect(canTransitionMilestone('DONE', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionMilestone('PENDING', 'DONE')).toBe(false);
    expect(canTransitionMilestone('PENDING', 'PENDING')).toBe(true);
  });
});

describe('AgreementsService', () => {
  const publicUser = {
    id: 'u1',
    displayName: 'U1',
    avatarUrl: null,
    bio: null,
    location: null,
    isBusiness: false,
    companyName: null,
    ratingAvg: 5,
    ratingCount: 1,
    completedCount: 1,
    createdAt: new Date(),
  };

  const users = {
    toPublicUser: vi.fn().mockResolvedValue(publicUser),
  };

  const storage = {
    presignGet: vi.fn().mockResolvedValue('https://s3.local/file.pdf'),
  };

  const events = {
    emit: vi.fn(),
  };

  function createPrismaMock() {
    const mock: Record<string, unknown> = {
      agreement: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      milestone: {
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
        aggregate: vi.fn(),
      },
      deliverable: {
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      agreementEvent: {
        create: vi.fn(),
      },
      listing: {
        update: vi.fn(),
      },
      user: {
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      upload: {
        findMany: vi.fn(),
      },
      report: {
        create: vi.fn(),
      },
      review: {
        create: vi.fn(),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ average: 4.5, count: 2n }]),
    };
    mock.$transaction = vi
      .fn()
      .mockImplementation((cb: (tx: unknown) => unknown) => Promise.resolve(cb(mock)));
    return mock;
  }

  it('rejects strangers from participant actions', async () => {
    const prisma = createPrismaMock();
    (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(null);
    const service = new AgreementsService(
      prisma as never,
      storage as never,
      users as never,
      events as never,
    );

    await expect(service.detail('a', 'x')).rejects.toThrow(NotFoundException);
    await expect(service.createMilestone('a', 'x', { title: 'M' })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.updateMilestone('a', 'm', 'x', {})).rejects.toThrow(NotFoundException);
    await expect(
      service.submitDeliverable('a', 'x', { note: 'n', attachmentIds: ['u'] }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.resolveDeliverable('a', 'd', 'x')).rejects.toThrow(NotFoundException);
    await expect(service.complete('a', 'x')).rejects.toThrow(NotFoundException);
    await expect(service.cancel('a', 'x', 'r')).rejects.toThrow(NotFoundException);
    await expect(service.dispute('a', 'x', 'r')).rejects.toThrow(NotFoundException);
    await expect(service.review('a', 'x', { rating: 5 })).rejects.toThrow(NotFoundException);
  });

  it('enforces role checks and returns 403 when wrong role acts', async () => {
    const agreement = { id: 'a', buyerId: 'b', providerId: 'p', status: 'ACTIVE' };
    const prisma = createPrismaMock();
    (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
      agreement,
    );
    const service = new AgreementsService(
      prisma as never,
      storage as never,
      users as never,
      events as never,
    );

    await expect(
      service.submitDeliverable('a', 'b', { note: 'n', attachmentIds: ['u'] }),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.resolveDeliverable('a', 'd', 'p')).rejects.toThrow(ForbiddenException);
  });

  it('lists agreements with lighter summary shape', async () => {
    const prisma = createPrismaMock();
    const mockRow = {
      id: 'a1',
      listingId: 'l1',
      bidId: 'b1',
      buyerId: 'b',
      providerId: 'p',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
      buyerConfirmedAt: null,
      providerConfirmedAt: null,
      buyer: { id: 'b' },
      provider: { id: 'p' },
      listing: {
        id: 'l1',
        category: { id: 'c1', name: 'Cat' },
        owner: { id: 'b' },
      },
      bid: {
        id: 'b1',
        bidder: { id: 'p' },
      },
      conversation: { id: 'c1' },
      milestones: [],
      deliverables: [
        {
          id: 'd1',
          agreementId: 'a1',
          note: 'Done',
          submittedById: 'p',
          acceptedAt: null,
          revisionNote: null,
          createdAt: new Date(),
        },
      ],
    };
    (prisma.agreement as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([
      mockRow,
    ]);
    const service = new AgreementsService(
      prisma as never,
      storage as never,
      users as never,
      events as never,
    );

    const result = await service.list('b', { limit: 10, role: 'buyer', status: 'ACTIVE' });
    expect(result.items).toHaveLength(1);
    const [first] = result.items;
    expect(first?.myRole).toBe('buyer');
    expect(first?.deliverables[0]).not.toHaveProperty('attachments');
  });

  it('shows detail with presigned deliverable attachments', async () => {
    const prisma = createPrismaMock();
    const agreement = { id: 'a1', buyerId: 'b', providerId: 'p', status: 'ACTIVE' };
    (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
      agreement,
    );
    (
      prisma.agreement as { findUniqueOrThrow: ReturnType<typeof vi.fn> }
    ).findUniqueOrThrow.mockResolvedValue({
      ...agreement,
      buyerConfirmedAt: null,
      providerConfirmedAt: null,
      buyer: { id: 'b' },
      provider: { id: 'p' },
      listing: { id: 'l1', category: { id: 'c1', name: 'Cat' }, owner: { id: 'b' } },
      bid: { id: 'b1', bidder: { id: 'p' } },
      conversation: null,
      milestones: [],
      deliverables: [
        {
          id: 'd1',
          note: 'Work',
          attachments: [
            {
              upload: {
                id: 'u1',
                key: 'k1',
                fileName: 'w.pdf',
                mimeType: 'application/pdf',
                sizeBytes: 10,
              },
            },
          ],
        },
      ],
      events: [],
    });
    const service = new AgreementsService(
      prisma as never,
      storage as never,
      users as never,
      events as never,
    );

    const detail = await service.detail('a1', 'b');
    expect(detail.myRole).toBe('buyer');
    const [firstDeliverable] = detail.deliverables;
    const [firstAttachment] = firstDeliverable?.attachments ?? [];
    expect(firstAttachment?.url).toBe('https://s3.local/file.pdf');
  });

  describe('milestones', () => {
    it('creates milestone conditionally', async () => {
      const prisma = createPrismaMock();
      const agreement = { id: 'a1', buyerId: 'b', providerId: 'p', status: 'ACTIVE' };
      (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        agreement,
      );
      (prisma as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw.mockResolvedValueOnce([
        { status: 'ACTIVE' },
      ]);
      (prisma.milestone as { aggregate: ReturnType<typeof vi.fn> }).aggregate.mockResolvedValue({
        _max: { position: 1 },
      });
      (prisma.milestone as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue({
        id: 'm2',
        position: 2,
      });

      const service = new AgreementsService(
        prisma as never,
        storage as never,
        users as never,
        events as never,
      );
      const m = await service.createMilestone('a1', 'b', { title: 'M2', amountCents: 100 });
      expect(m.id).toBe('m2');

      // Agreement not actionable
      (prisma as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw.mockResolvedValueOnce([
        { status: 'CANCELLED' },
      ]);
      await expect(service.createMilestone('a1', 'b', { title: 'M2' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('updates milestone with conditional check', async () => {
      const prisma = createPrismaMock();
      const agreement = { id: 'a1', buyerId: 'b', providerId: 'p', status: 'ACTIVE' };
      (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        agreement,
      );
      (prisma as { $queryRaw: ReturnType<typeof vi.fn> }).$queryRaw.mockResolvedValue([
        { status: 'ACTIVE' },
      ]);
      (prisma.milestone as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
        id: 'm1',
        agreementId: 'a1',
        status: 'PENDING',
      });
      (prisma.milestone as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue({
        count: 1,
      });
      (
        prisma.milestone as { findUniqueOrThrow: ReturnType<typeof vi.fn> }
      ).findUniqueOrThrow.mockResolvedValue({ id: 'm1', status: 'IN_PROGRESS' });

      const service = new AgreementsService(
        prisma as never,
        storage as never,
        users as never,
        events as never,
      );
      const updated = await service.updateMilestone('a1', 'm1', 'b', { status: 'IN_PROGRESS' });
      expect(updated.status).toBe('IN_PROGRESS');

      // Invalid transition
      await expect(service.updateMilestone('a1', 'm1', 'b', { status: 'DONE' })).rejects.toThrow(
        ConflictException,
      );

      // Milestone not found
      (prisma.milestone as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        null,
      );
      await expect(service.updateMilestone('a1', 'm1', 'b', { title: 'New' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deliverables', () => {
    it('submits deliverable and enforces non-reuse of attachments', async () => {
      const prisma = createPrismaMock();
      const agreement = { id: 'a1', buyerId: 'b', providerId: 'p', status: 'ACTIVE' };
      (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        agreement,
      );
      (prisma.upload as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([
        { id: 'u1' },
      ]);
      (prisma.agreement as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue({
        count: 1,
      });
      (prisma.deliverable as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue({
        id: 'd1',
        attachments: [
          {
            upload: {
              id: 'u1',
              key: 'k1',
              fileName: 'w.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 10,
            },
          },
        ],
      });

      const service = new AgreementsService(
        prisma as never,
        storage as never,
        users as never,
        events as never,
      );
      const d = await service.submitDeliverable('a1', 'p', { note: 'Done', attachmentIds: ['u1'] });
      expect(d.id).toBe('d1');

      // Duplicate attachmentIds
      await expect(
        service.submitDeliverable('a1', 'p', { note: 'Done', attachmentIds: ['u1', 'u1'] }),
      ).rejects.toThrow(BadRequestException);

      // Missing or reused attachment
      (prisma.upload as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([]);
      await expect(
        service.submitDeliverable('a1', 'p', { note: 'Done', attachmentIds: ['u1'] }),
      ).rejects.toThrow(BadRequestException);

      // Concurrent attachment reuse P2002 maps to 409 ConflictException
      (prisma.upload as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValue([
        { id: 'u1' },
      ]);
      (prisma.$transaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.1',
        }),
      );
      await expect(
        service.submitDeliverable('a1', 'p', { note: 'Done', attachmentIds: ['u1'] }),
      ).rejects.toThrow(ConflictException);
    });

    it('resolves deliverable with accept and revision', async () => {
      const prisma = createPrismaMock();
      const agreement = { id: 'a1', buyerId: 'b', providerId: 'p', status: 'DELIVERED' };
      (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        agreement,
      );
      (prisma.deliverable as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
        id: 'd1',
        agreementId: 'a1',
      });
      (prisma.deliverable as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue(
        { count: 1 },
      );
      (prisma.agreement as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue({
        count: 1,
      });
      (
        prisma.deliverable as { findUniqueOrThrow: ReturnType<typeof vi.fn> }
      ).findUniqueOrThrow.mockResolvedValue({
        id: 'd1',
        attachments: [],
      });

      const service = new AgreementsService(
        prisma as never,
        storage as never,
        users as never,
        events as never,
      );
      const accepted = await service.resolveDeliverable('a1', 'd1', 'b');
      expect(accepted.id).toBe('d1');

      const revised = await service.resolveDeliverable('a1', 'd1', 'b', 'Please revise');
      expect(revised.id).toBe('d1');

      // Missing deliverable
      (prisma.deliverable as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        null,
      );
      await expect(service.resolveDeliverable('a1', 'missing', 'b')).rejects.toThrow(
        NotFoundException,
      );

      // Already resolved deliverable
      (prisma.deliverable as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue({
        id: 'd1',
        agreementId: 'a1',
      });
      (prisma.deliverable as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue(
        { count: 0 },
      );
      await expect(service.resolveDeliverable('a1', 'd1', 'b')).rejects.toThrow(ConflictException);
    });
  });

  describe('completion, cancel, dispute, review', () => {
    it('handles completion idempotent and final confirmation', async () => {
      const prisma = createPrismaMock();
      const agreement = {
        id: 'a1',
        buyerId: 'b',
        providerId: 'p',
        status: 'ACTIVE',
        listingId: 'l1',
      };
      (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        agreement,
      );
      (prisma.agreement as { updateMany: ReturnType<typeof vi.fn> }).updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 });
      (
        prisma.agreement as { findUniqueOrThrow: ReturnType<typeof vi.fn> }
      ).findUniqueOrThrow.mockResolvedValue({
        ...agreement,
        buyerConfirmedAt: new Date(),
        providerConfirmedAt: new Date(),
        buyer: { id: 'b' },
        provider: { id: 'p' },
        listing: { id: 'l1', category: { id: 'c1', name: 'Cat' }, owner: { id: 'b' } },
        bid: { id: 'b1', bidder: { id: 'p' } },
        conversation: null,
        milestones: [],
        deliverables: [],
        events: [],
      });

      const service = new AgreementsService(
        prisma as never,
        storage as never,
        users as never,
        events as never,
      );
      const detail = await service.complete('a1', 'b');
      expect(detail.id).toBe('a1');

      // Concurrent cancel won
      (prisma.agreement as { updateMany: ReturnType<typeof vi.fn> }).updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });
      (prisma.agreement as { findUnique: ReturnType<typeof vi.fn> }).findUnique.mockResolvedValue({
        status: 'CANCELLED',
      });
      await expect(service.complete('a1', 'b')).rejects.toThrow(ConflictException);
    });

    it('cancels and disputes agreement', async () => {
      const prisma = createPrismaMock();
      const agreement = {
        id: 'a1',
        buyerId: 'b',
        providerId: 'p',
        status: 'ACTIVE',
        listingId: 'l1',
      };
      (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        agreement,
      );
      (prisma.agreement as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue({
        count: 1,
      });
      (
        prisma.agreement as { findUniqueOrThrow: ReturnType<typeof vi.fn> }
      ).findUniqueOrThrow.mockResolvedValue({
        ...agreement,
        buyerConfirmedAt: null,
        providerConfirmedAt: null,
        buyer: { id: 'b' },
        provider: { id: 'p' },
        listing: { id: 'l1', category: { id: 'c1', name: 'Cat' }, owner: { id: 'b' } },
        bid: { id: 'b1', bidder: { id: 'p' } },
        conversation: null,
        milestones: [],
        deliverables: [],
        events: [],
      });

      const service = new AgreementsService(
        prisma as never,
        storage as never,
        users as never,
        events as never,
      );
      await service.cancel('a1', 'b', 'no longer needed');
      await service.dispute('a1', 'b', 'fraud');

      // Conflict when already cancelled
      (prisma.agreement as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue({
        count: 0,
      });
      await expect(service.cancel('a1', 'b', 'again')).rejects.toThrow(ConflictException);
      await expect(service.dispute('a1', 'b', 'again')).rejects.toThrow(ConflictException);
    });

    it('submits review and locks target row', async () => {
      const prisma = createPrismaMock();
      const agreement = { id: 'a1', buyerId: 'b', providerId: 'p', status: 'COMPLETED' };
      (prisma.agreement as { findFirst: ReturnType<typeof vi.fn> }).findFirst.mockResolvedValue(
        agreement,
      );
      (prisma.review as { create: ReturnType<typeof vi.fn> }).create.mockResolvedValue({
        id: 'r1',
        rating: 5,
      });

      const service = new AgreementsService(
        prisma as never,
        storage as never,
        users as never,
        events as never,
      );
      const r = await service.review('a1', 'b', { rating: 5, comment: 'Great' });
      expect(r.id).toBe('r1');
      expect(prisma.$executeRaw).toHaveBeenCalled();

      // Duplicate review P2002
      (prisma.review as { create: ReturnType<typeof vi.fn> }).create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: '7',
        }),
      );
      await expect(service.review('a1', 'b', { rating: 5 })).rejects.toThrow(ConflictException);
    });
  });
});
