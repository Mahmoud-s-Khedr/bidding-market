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
