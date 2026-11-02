import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
const user = {
  id: 'u',
  email: 'private@test',
  role: 'USER',
  displayName: 'Name',
  avatarKey: null,
  bio: null,
  location: null,
  isBusiness: false,
  companyName: null,
  ratingAvg: 0,
  ratingCount: 0,
  completedCount: 0,
  createdAt: new Date(),
};
describe('UsersService', () => {
  it('maps profile and hides private fields', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
    const service = new UsersService(prisma as never);
    const result = await service.profile('u');
    expect(result).not.toHaveProperty('email');
    expect(result).toMatchObject({ id: 'u', avatarUrl: null });
  });
  it('throws missing and updates', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(user),
      },
    };
    const service = new UsersService(prisma as never);
    await expect(service.profile('x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('u', { displayName: 'Other' })).resolves.toMatchObject({
      displayName: 'Name',
    });
  });
  it('paginates reviews', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      review: { findMany: vi.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]) },
    };
    const result = await new UsersService(prisma as never).reviews('u', undefined, 1);
    expect(result).toEqual({ items: [{ id: '1' }], nextCursor: '1' });
  });
});
