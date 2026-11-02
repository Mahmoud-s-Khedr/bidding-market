import { describe, expect, it, vi } from 'vitest';
import { UserPresenter, toPublicUser } from './user.presenter.js';

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

  it('presigns avatarUrl and caches repeated calls', async () => {
    const storage = { presignGet: vi.fn().mockResolvedValue('https://s3.example.com/avatar.png') };
    const presenter = new UserPresenter(storage as never);

    const publicUser1 = await presenter.toPublicUser({
      id: 'u1',
      displayName: 'Alice',
      avatarKey: 'avatars/u1/pic.png',
    });

    expect(publicUser1.avatarUrl).toBe('https://s3.example.com/avatar.png');
    expect(storage.presignGet).toHaveBeenCalledTimes(1);
    expect(storage.presignGet).toHaveBeenCalledWith('avatars/u1/pic.png');

    const publicUser2 = await presenter.toPublicUser({
      id: 'u1',
      displayName: 'Alice',
      avatarKey: 'avatars/u1/pic.png',
    });

    expect(publicUser2.avatarUrl).toBe('https://s3.example.com/avatar.png');
    // Cached, so no second call
    expect(storage.presignGet).toHaveBeenCalledTimes(1);
  });

  it('maps toPrivateUser with email, role, and presigned avatarUrl', async () => {
    const storage = { presignGet: vi.fn().mockResolvedValue('https://s3.example.com/private.png') };
    const presenter = new UserPresenter(storage as never);

    const privateUser = await presenter.toPrivateUser({
      id: 'u2',
      email: 'user@example.com',
      role: 'ADMIN',
      displayName: 'Admin User',
      avatarKey: 'avatars/u2/pic.png',
    });

    expect(privateUser.email).toBe('user@example.com');
    expect(privateUser.role).toBe('ADMIN');
    expect(privateUser.avatarUrl).toBe('https://s3.example.com/private.png');
  });

  it('works via standalone toPublicUser function', async () => {
    const storage = { presignGet: vi.fn().mockResolvedValue('https://s3.example.com/helper.png') };
    const publicUser = await toPublicUser(
      {
        id: 'u3',
        displayName: 'Bob',
        avatarKey: 'avatars/u3/pic.png',
      },
      storage as never,
    );

    expect(publicUser.avatarUrl).toBe('https://s3.example.com/helper.png');
  });
});
