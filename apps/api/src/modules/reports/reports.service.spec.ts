import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminService, ReportsService } from './reports.service.js';
import { isDeleted } from './message-deletion.js';

describe('AdminService last-admin guard', () => {
  it('rejects demoting the last remaining admin before changing the user', async () => {
    const tx = {
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
  it('identifies deleted messages', () => {
    expect(isDeleted({ deletedAt: new Date() })).toBe(true);
    expect(isDeleted({ deletedAt: null })).toBe(false);
  });
});

describe('AdminService moderation', () => {
  const transaction = () => ({
    user: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
    listing: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    bid: { findUnique: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    agreement: { groupBy: vi.fn(), findUnique: vi.fn() },
    report: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    message: { findUnique: vi.fn(), updateMany: vi.fn() },
    refreshToken: { updateMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
  });
  const setup = () => {
    const tx = transaction();
    const prisma = {
      ...tx,
      $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
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
});
