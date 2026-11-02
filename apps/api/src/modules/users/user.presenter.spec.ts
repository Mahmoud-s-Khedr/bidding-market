import { describe, expect, it, vi } from 'vitest';
import { UserPresenter } from './user.presenter.js';

describe('UserPresenter', () => {
  it('returns null avatarUrl when avatarKey is null or undefined', async () => {
    const storage = { presignGet: vi.fn() };
    const presenter = new UserPresenter(storage as never);

    const publicUser = await presenter.toPublicUser({
      id: 'u1',
      displayName: 'Alice',
      avatarKey: null,
      bio: null,
      location: null,
      isBusiness: false,
      companyName: null,
      ratingAvg: 0,
      ratingCount: 0,
      completedCount: 0,
      createdAt: new Date(),
    });

    expect(publicUser.avatarUrl).toBeNull();
    expect(storage.presignGet).not.toHaveBeenCalled();
  });

  it('presigns avatarUrl using storage service', async () => {
    const storage = { presignGet: vi.fn().mockResolvedValue('https://s3.example.com/avatar.png') };
    const presenter = new UserPresenter(storage as never);

    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const publicUser = await presenter.toPublicUser({
      id: 'u1',
      displayName: 'Alice',
      avatarKey: 'avatars/u1/pic.png',
      createdAt,
    });

    expect(publicUser.avatarUrl).toBe('https://s3.example.com/avatar.png');
    expect(publicUser.createdAt).toBe(createdAt);
    expect(storage.presignGet).toHaveBeenCalledWith('avatars/u1/pic.png');
  });

  it('maps toPrivateUser with email, role, and presigned avatarUrl', async () => {
    const storage = { presignGet: vi.fn().mockResolvedValue('https://s3.example.com/private.png') };
    const presenter = new UserPresenter(storage as never);

    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const privateUser = await presenter.toPrivateUser({
      id: 'u2',
      email: 'user@example.com',
      role: 'ADMIN',
      displayName: 'Admin User',
      avatarKey: 'avatars/u2/pic.png',
      createdAt,
    });

    expect(privateUser.email).toBe('user@example.com');
    expect(privateUser.role).toBe('ADMIN');
    expect(privateUser.avatarUrl).toBe('https://s3.example.com/private.png');
    expect(privateUser.createdAt).toBe(createdAt);
  });
});
