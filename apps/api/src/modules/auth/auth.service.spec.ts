import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
vi.mock('argon2', () => ({
  argon2id: 2,
  hash: vi.fn().mockResolvedValue('hash'),
  verify: vi.fn(),
}));
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
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
const base = () => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
  refreshToken: { create: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({
        refreshToken: { create: vi.fn().mockResolvedValue({ id: 'new' }), update: vi.fn() },
      }),
  ),
});
describe('AuthService', () => {
  it('registers a new account', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue(user);
    await expect(
      new AuthService(p as never, { sign: vi.fn().mockReturnValue('access') } as never).register({
        email: 'a@test.com',
        password: 'Password1',
        displayName: 'AA',
      }),
    ).resolves.toMatchObject({ accessToken: 'access' });
  });
  it('rejects duplicate registration', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValue(user);
    await expect(
      new AuthService(p as never, { sign: vi.fn() } as never).register({
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
    const s = new AuthService(p as never, { sign: vi.fn() } as never);
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
    p.refreshToken.findMany
      .mockResolvedValueOnce([
        {
          id: 'old',
          userId: 'u',
          familyId: 'f',
          tokenHash: 'h',
          expiresAt: new Date(Date.now() + 10000),
          user,
        },
      ])
      .mockResolvedValueOnce([{ id: 'old', familyId: 'f', tokenHash: 'h', user }])
      .mockResolvedValueOnce([{ id: 'old', familyId: 'f', tokenHash: 'h', user }]);
    vi.mocked(argon2.verify)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const s = new AuthService(p as never, { sign: vi.fn().mockReturnValue('access') } as never);
    await expect(s.refresh('raw')).resolves.toMatchObject({ accessToken: 'access' });
    await expect(s.refresh('old')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(p.refreshToken.updateMany).toHaveBeenCalled();
  });
  it('revokes on logout', async () => {
    const p = base();
    p.refreshToken.findMany.mockResolvedValue([{ id: 't', tokenHash: 'h' }]);
    vi.mocked(argon2.verify).mockResolvedValue(true);
    await new AuthService(p as never, { sign: vi.fn() } as never).logout('raw');
    expect(p.refreshToken.update).toHaveBeenCalled();
  });
  it('returns me and rejects missing user', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(null);
    const service = new AuthService(p as never, { sign: vi.fn() } as never);
    await expect(service.me('u')).resolves.toMatchObject({ id: 'u' });
    await expect(service.me('x')).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('covers absent login and logout tokens', async () => {
    const p = base();
    p.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(p as never, { sign: vi.fn() } as never);
    await expect(service.login({ email: 'x@test.com', password: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.logout()).resolves.toBeUndefined();
  });
});
