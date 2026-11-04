import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminService, ReportsService } from './reports.service.js';

describe('AdminService last-admin guard', () => {
  it('rejects demoting the last remaining admin before changing the user', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'target', role: 'ADMIN', status: 'ACTIVE' }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn(),
      },
      refreshToken: { updateMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const prisma = { $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) };
    const service = new AdminService(
      prisma as never,
      { invalidateCache: vi.fn() } as never,
      { emit: vi.fn() } as never,
    );
    await expect(service.updateUser('actor', 'target', { role: 'USER' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

describe('ReportsService target validation', () => {
  const base = () => ({
    listing: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    message: { findUnique: vi.fn() },
    bid: { findUnique: vi.fn() },
    agreement: { findUnique: vi.fn() },
    report: { create: vi.fn() },
  });
  it('rejects reporting an owned listing', async () => {
    const prisma = base();
    prisma.listing.findUnique.mockResolvedValue({ ownerId: 'me' });
    await expect(
      new ReportsService(prisma as never).create(
        { id: 'me', role: 'USER' },
        { targetType: 'LISTING', targetId: 'x', reason: 'SPAM' },
      ),
    ).rejects.toThrow('own listing');
  });
  it('returns not found for an invisible message', async () => {
    const prisma = base();
    prisma.message.findUnique.mockResolvedValue({
      senderId: 'other',
      conversation: { participants: [] },
    });
    await expect(
      new ReportsService(prisma as never).assertVisibleTarget(
        { id: 'me', role: 'USER' },
        'MESSAGE',
        'x',
      ),
    ).rejects.toThrow('Target not found');
  });
});

describe('AdminService moderation', () => {
  const transaction = () => ({
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    listing: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    bid: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    agreement: { groupBy: vi.fn(), findUnique: vi.fn() },
    report: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    message: { findUnique: vi.fn(), updateMany: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  });
  const setup = () => {
    const tx = transaction();
    const prisma = {
      ...tx,
      $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
    };
    const categories = { invalidateCache: vi.fn() };
    const events = { emit: vi.fn() };
    return {
      tx,
      prisma,
      categories,
      events,
      service: new AdminService(prisma as never, categories as never, events as never),
    };
  };
  it('zero fills all status buckets in stats', async () => {
    const { prisma, service } = setup();
    prisma.user.groupBy = vi.fn().mockResolvedValue([{ status: 'ACTIVE', _count: { id: 2 } }]);
    prisma.listing.groupBy = vi.fn().mockResolvedValue([]);
    prisma.bid.count = vi.fn().mockResolvedValue(3);
    prisma.agreement.groupBy = vi.fn().mockResolvedValue([]);
    prisma.report.count = vi.fn().mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValue([
      { day: new Date('2026-01-01Z'), signups: 0n, listings: 0n, bids: 0n, agreements: 0n },
    ]);
    const result = await service.stats();
    expect(result.users.SUSPENDED).toBe(0);
    expect(result.listings.OPEN).toBe(0);
    expect(result.daily[0]?.signups).toBe(0);
  });
  it('revokes refresh tokens and audits a suspension', async () => {
    const { tx, service } = setup();
    tx.user.findUnique.mockResolvedValue({ id: 'u', role: 'USER', status: 'ACTIVE' });
    tx.user.update.mockResolvedValue({ role: 'USER', status: 'SUSPENDED' });
    await service.updateUser('admin', 'u', { status: 'SUSPENDED', reason: 'reason' });
    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'USER_UPDATED' }) }),
    );
  });
  it.each([
    ['DISMISS', 'USER'],
    ['REMOVE_CONTENT', 'MESSAGE'],
    ['REMOVE_CONTENT', 'BID'],
    ['REMOVE_CONTENT', 'LISTING'],
    ['SUSPEND_USER', 'USER'],
    ['SUSPEND_USER', 'LISTING'],
    ['SUSPEND_USER', 'MESSAGE'],
    ['SUSPEND_USER', 'BID'],
  ] as const)('resolves %s for %s', async (action, targetType) => {
    const { tx, service } = setup();
    tx.report.findUnique.mockResolvedValue({
      id: 'r',
      reporterId: 'reporter',
      targetType,
      targetId: 'target',
    });
    tx.report.updateMany.mockResolvedValue({ count: 1 });
    tx.message.updateMany.mockResolvedValue({ count: 1 });
    tx.bid.updateMany.mockResolvedValue({ count: 1 });
    tx.listing.findUnique.mockResolvedValue({ id: 'target', status: 'OPEN', ownerId: 'owner' });
    tx.listing.updateMany.mockResolvedValue({ count: 1 });
    tx.user.update.mockResolvedValue({});
    tx.user.findUnique.mockResolvedValue({ role: 'USER' });
    tx.message.findUnique.mockResolvedValue({ senderId: 'owner' });
    tx.bid.findUnique.mockResolvedValue({ bidderId: 'owner' });
    await expect(
      service.resolveReport('admin', 'r', { action, note: 'note' }),
    ).resolves.toMatchObject({ resolution: action });
  });
  it.each([
    ['REMOVE_CONTENT', 'USER'],
    ['REMOVE_CONTENT', 'AGREEMENT'],
    ['SUSPEND_USER', 'AGREEMENT'],
  ] as const)('rejects invalid %s/%s matrix entries', async (action, targetType) => {
    const { tx, service } = setup();
    tx.report.findUnique.mockResolvedValue({
      id: 'r',
      reporterId: 'reporter',
      targetType,
      targetId: 'target',
    });
    tx.report.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.resolveReport('admin', 'r', { action, note: 'note' })).rejects.toThrow();
  });
  it('rejects self modification in updateUser', async () => {
    const { service } = setup();
    await expect(service.updateUser('admin', 'admin', { role: 'USER' })).rejects.toThrow(
      'You cannot modify yourself',
    );
  });
  it('rejects suspending the actor or an admin in resolveReport', async () => {
    const { tx, service } = setup();
    tx.report.findUnique.mockResolvedValue({
      id: 'r',
      reporterId: 'reporter',
      targetType: 'USER',
      targetId: 'admin',
    });
    tx.report.updateMany.mockResolvedValue({ count: 1 });
    tx.user.findUnique.mockResolvedValue({ id: 'admin', role: 'ADMIN' });
    await expect(
      service.resolveReport('admin', 'r', { action: 'SUSPEND_USER', note: 'bad' }),
    ).rejects.toThrow('You cannot suspend yourself');

    tx.report.findUnique.mockResolvedValue({
      id: 'r2',
      reporterId: 'reporter',
      targetType: 'USER',
      targetId: 'other-admin',
    });
    tx.user.findUnique.mockResolvedValue({ id: 'other-admin', role: 'ADMIN' });
    await expect(
      service.resolveReport('admin', 'r2', { action: 'SUSPEND_USER', note: 'bad' }),
    ).rejects.toThrow('Administrators cannot be suspended');
  });
  it('paginates users, listings, reports, and audit logs', async () => {
    const { prisma, service } = setup();
    prisma.user.findMany = vi.fn().mockResolvedValue([
      { id: 'u1', createdAt: new Date() },
      { id: 'u2', createdAt: new Date() },
    ]);
    const usersRes = await service.users({ limit: 1, q: 'test', role: 'USER', status: 'ACTIVE' });
    expect(usersRes.items).toHaveLength(1);
    expect(usersRes.nextCursor).toBeDefined();

    prisma.listing.findMany = vi.fn().mockResolvedValue([
      { id: 'l1', createdAt: new Date() },
      { id: 'l2', createdAt: new Date() },
    ]);
    const listingsRes = await service.listings({ limit: 1, q: 'test', status: 'OPEN' });
    expect(listingsRes.items).toHaveLength(1);
    expect(listingsRes.nextCursor).toBeDefined();

    prisma.report.findMany = vi.fn().mockResolvedValue([
      { id: 'r1', targetType: 'USER', targetId: 'u1', createdAt: new Date() },
      { id: 'r2', targetType: 'LISTING', targetId: 'l1', createdAt: new Date() },
    ]);
    prisma.user.findUnique = vi.fn().mockResolvedValue({ id: 'u1', displayName: 'U1' });
    prisma.listing.findUnique = vi.fn().mockResolvedValue({ id: 'l1', title: 'L1' });
    prisma.message.findUnique = vi.fn().mockResolvedValue({ id: 'm1', body: 'hi' });
    prisma.bid.findUnique = vi.fn().mockResolvedValue({ id: 'b1', amountCents: 100 });
    prisma.agreement.findUnique = vi.fn().mockResolvedValue({ id: 'a1', status: 'ACTIVE' });

    const reportsRes = await service.reports({ limit: 1, status: 'OPEN' });
    expect(reportsRes.items).toHaveLength(1);
    expect(reportsRes.nextCursor).toBeDefined();

    prisma.auditLog.findMany = vi.fn().mockResolvedValue([
      { id: 'a1', createdAt: new Date() },
      { id: 'a2', createdAt: new Date() },
    ]);
    const auditRes = await service.audit({
      limit: 1,
      action: 'USER_UPDATED',
      actorId: 'admin',
      targetType: 'USER',
    });
    expect(auditRes.items).toHaveLength(1);
    expect(auditRes.nextCursor).toBeDefined();
  });
  it('handles restoreListing and removeListing edge cases', async () => {
    const { tx, service } = setup();
    tx.listing.findUnique.mockResolvedValueOnce(null);
    await expect(service.removeListing('admin', 'missing', 'reason')).rejects.toThrow(
      'Listing not found',
    );

    tx.listing.findUnique.mockResolvedValueOnce({ id: 'l1', status: 'REMOVED' });
    await expect(service.removeListing('admin', 'l1', 'reason')).rejects.toThrow(
      'Listing is already removed',
    );

    tx.listing.findUnique.mockResolvedValueOnce(null);
    await expect(service.restoreListing('admin', 'missing', 'reason')).rejects.toThrow(
      'Listing not found',
    );

    tx.listing.findUnique.mockResolvedValueOnce({ id: 'l1', status: 'OPEN', previousStatus: null });
    await expect(service.restoreListing('admin', 'l1', 'reason')).rejects.toThrow(
      'Listing is not removed',
    );
  });
});
