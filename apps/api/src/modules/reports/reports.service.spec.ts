import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminService } from './reports.service.js';

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
