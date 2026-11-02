import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UserPresenter } from './user.presenter.js';

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

const createMockPresenter = () => {
  const storage = {
    presignGet: vi.fn().mockImplementation((k: string) => Promise.resolve(`https://s3/${k}`)),
  };
  return new UserPresenter(storage as never);
};

describe('UsersService', () => {
  it('maps profile and hides private fields', async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
    const presenter = createMockPresenter();
    const service = new UsersService(prisma as never, presenter);
    const result = await service.profile('u');
    expect(result).not.toHaveProperty('email');
    expect(result).toMatchObject({ id: 'u', avatarUrl: null });
  });

  it('throws missing and updates profile', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValue(user),
        update: vi.fn().mockResolvedValue(user),
      },
    };
    const presenter = createMockPresenter();
    const service = new UsersService(prisma as never, presenter);
    await expect(service.profile('x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('u', { displayName: 'Other' })).resolves.toMatchObject({
      displayName: 'Name',
    });
  });

  it('validates avatarUploadId on update', async () => {
    const prisma = {
      upload: {
        findUnique: vi.fn(),
      },
      user: {
        update: vi.fn().mockResolvedValue({ ...user, avatarKey: 'avatars/u/pic.png' }),
      },
    };
    const presenter = createMockPresenter();
    const service = new UsersService(prisma as never, presenter);

    // 1. Missing upload -> 400
    prisma.upload.findUnique.mockResolvedValueOnce(null);
    await expect(service.update('u', { avatarUploadId: 'up1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // 2. Belongs to someone else -> 400
    prisma.upload.findUnique.mockResolvedValueOnce({
      id: 'up1',
      uploaderId: 'other-user',
      status: 'READY',
      purpose: 'AVATAR',
      key: 'avatars/other/pic.png',
    });
    await expect(service.update('u', { avatarUploadId: 'up1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // 3. Not READY -> 400
    prisma.upload.findUnique.mockResolvedValueOnce({
      id: 'up1',
      uploaderId: 'u',
      status: 'PENDING',
      purpose: 'AVATAR',
      key: 'avatars/u/pic.png',
    });
    await expect(service.update('u', { avatarUploadId: 'up1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // 4. Purpose not AVATAR -> 400
    prisma.upload.findUnique.mockResolvedValueOnce({
      id: 'up1',
      uploaderId: 'u',
      status: 'READY',
      purpose: 'LISTING_IMAGE',
      key: 'listing_image/u/pic.png',
    });
    await expect(service.update('u', { avatarUploadId: 'up1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    // 5. Valid AVATAR upload -> success
    prisma.upload.findUnique.mockResolvedValueOnce({
      id: 'up1',
      uploaderId: 'u',
      status: 'READY',
      purpose: 'AVATAR',
      key: 'avatars/u/pic.png',
    });
    const updated = await service.update('u', { avatarUploadId: 'up1' });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ avatarKey: 'avatars/u/pic.png' }),
      }),
    );
    expect(updated.avatarUrl).toBe('https://s3/avatars/u/pic.png');

    // 6. avatarUploadId = null clears avatar
    prisma.user.update.mockResolvedValueOnce({ ...user, avatarKey: null });
    const cleared = await service.update('u', { avatarUploadId: null });
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ avatarKey: null }),
      }),
    );
    expect(cleared.avatarUrl).toBeNull();
  });

  it('paginates reviews', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      review: { findMany: vi.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]) },
    };
    const presenter = createMockPresenter();
    const result = await new UsersService(prisma as never, presenter).reviews('u', undefined, 1);
    expect(result).toEqual({ items: [{ id: '1' }], nextCursor: '1' });
  });
});
