import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type * as Argon2 from 'argon2';
vi.mock('argon2', () => ({
  argon2id: 2,
  hash: vi.fn().mockResolvedValue('hash'),
  verify: vi.fn(),
}));
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import { UserPresenter } from '../users/user.presenter.js';

const mockPresenter = new UserPresenter({
  presignGet: vi.fn().mockImplementation((k: string) => Promise.resolve(`https://s3/${k}`)),
} as never);
const user = {
  id: 'u',
  email: 'a@test.com',
  passwordHash: 'hash',
  role: 'USER' as const,
  status: 'ACTIVE' as const,
  displayName: 'A',
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
const env = {
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgresql://a:b@localhost/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  WEB_ORIGIN: 'http://localhost:3000',
  API_PORT: 4000,
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};
const base = () => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  refreshToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({
        refreshToken: {
          create: vi.fn().mockResolvedValue({ id: 'new' }),
          update: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      }),
  ),
});
describe('AuthService', () => {
  it('uses a real argon2id hash format for password verification', async () => {
    const realArgon = await vi.importActual<typeof Argon2>('argon2');
    const hash = await realArgon.hash('Password123!', { type: realArgon.argon2id });
    await expect(realArgon.verify(hash, 'Password123!')).resolves.toBe(true);
    await expect(realArgon.verify(hash, 'wrong')).resolves.toBe(false);
  });
  it('registers a new account', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue(user);
    const result = await new AuthService(
      p as never,
      { sign: vi.fn().mockReturnValue('access') } as never,
      env,
      mockPresenter,
    ).register({
      email: 'a@test.com',
      password: 'Password1',
      displayName: 'AA',
    });
    expect(result).toMatchObject({ accessToken: 'access' });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('status');
  });
  it('respects custom JWT_REFRESH_TTL for refresh token expiry', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue(user);
    const service = new AuthService(
      p as never,
      { sign: vi.fn().mockReturnValue('access') } as never,
      { ...env, JWT_REFRESH_TTL: '12h' },
      mockPresenter,
    );
    const before = Date.now();
    await service.register({
      email: 'custom-ttl@test.com',
      password: 'Password1',
      displayName: 'AA',
    });
    expect(p.refreshToken.create).toHaveBeenCalled();
    const firstCall = p.refreshToken.create.mock.calls[0] as unknown as [
      { data: { expiresAt: Date } },
    ];
    const expiresAt = firstCall[0].data.expiresAt.getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(12 * 60 * 60 * 1000 - 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(12 * 60 * 60 * 1000 + 5000);
  });
  it('rejects duplicate registration', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValue(user);
    await expect(
      new AuthService(p as never, { sign: vi.fn() } as never, env, mockPresenter).register({
        email: 'a@test.com',
        password: 'Password1',
        displayName: 'AA',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('handles wrong and inactive login', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValue(user);
    vi.mocked(argon2.verify).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const s = new AuthService(p as never, { sign: vi.fn() } as never, env, mockPresenter);
    await expect(s.login({ email: 'a@test.com', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    p.user.findUnique.mockResolvedValue({ ...user, status: 'BANNED' });
    await expect(s.login({ email: 'a@test.com', password: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('rotates and revokes reused refresh tokens', async () => {
    const p = base();
    p.refreshToken.findUnique
      .mockResolvedValueOnce({
        id: 'old',
        userId: 'u',
        familyId: 'f',
        tokenHash: 'h',
        expiresAt: new Date(Date.now() + 10000),
        user,
      })
      .mockResolvedValueOnce({
        id: 'old',
        familyId: 'f',
        tokenHash: 'h',
        revokedAt: new Date(),
        user,
      });
    const s = new AuthService(
      p as never,
      { sign: vi.fn().mockReturnValue('access') } as never,
      env,
      mockPresenter,
    );
    await expect(s.refresh('raw')).resolves.toMatchObject({ accessToken: 'access' });
    await expect(s.refresh('old')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(p.refreshToken.updateMany).toHaveBeenCalled();
  });
  it('revokes the family when the conditional rotation loses a race', async () => {
    const p = base();
    p.refreshToken.findUnique.mockResolvedValue({
      id: 'old',
      userId: 'u',
      familyId: 'f',
      tokenHash: 'h',
      expiresAt: new Date(Date.now() + 10000),
      user,
    });
    p.$transaction.mockImplementation(
      async (
        fn: (tx: {
          refreshToken: {
            create: () => Promise<{ id: string }>;
            updateMany: () => Promise<{ count: number }>;
          };
        }) => Promise<unknown>,
      ) =>
        fn({
          refreshToken: {
            create: vi.fn().mockResolvedValue({ id: 'new' }),
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        }),
    );
    const service = new AuthService(p as never, { sign: vi.fn() } as never, env, mockPresenter);
    await expect(service.refresh('raw')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(p.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'f', revokedAt: null } }),
    );
  });
  it('revokes on logout', async () => {
    const p = base();
    await new AuthService(p as never, { sign: vi.fn() } as never, env, mockPresenter).logout('raw');
    expect(p.refreshToken.updateMany).toHaveBeenCalled();
  });
  it('returns me and rejects missing user', async () => {
    const p = base();
    p.user.findUnique
      .mockResolvedValueOnce({ ...user, avatarKey: 'avatars/u/pic.png' })
      .mockResolvedValueOnce(null);
    const service = new AuthService(p as never, { sign: vi.fn() } as never, env, mockPresenter);
    await expect(service.me('u')).resolves.toMatchObject({
      id: 'u',
      avatarUrl: 'https://s3/avatars/u/pic.png',
    });
    await expect(service.me('x')).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('covers absent login and logout tokens', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(p as never, { sign: vi.fn() } as never, env, mockPresenter);
    await expect(service.login({ email: 'x@test.com', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.logout()).resolves.toBeUndefined();
  });
});
