import { describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard, RolesGuard } from './auth.guard.js';
const context = (request: {
  headers: { authorization?: string };
  user?: { id: string; role: 'USER' | 'ADMIN' };
}) => ({
  getHandler: vi.fn(),
  getClass: vi.fn(),
  switchToHttp: () => ({ getRequest: () => request }),
});
describe('JwtAuthGuard', () => {
  const mockPrisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', role: 'USER' }) },
  };

  it('rejects missing and invalid tokens', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const jwt = {
      verify: vi.fn(() => {
        throw new Error('bad');
      }),
    };
    const guard = new JwtAuthGuard(reflector as never, jwt as never, mockPrisma as never);
    await expect(guard.canActivate(context({ headers: {} }) as never)).rejects.toThrow();
    await expect(
      guard.canActivate(context({ headers: { authorization: 'Bearer x' } }) as never),
    ).rejects.toThrow();
  });
  it('allows missing token when isOptional is true', async () => {
    const reflector = {
      getAllAndOverride: vi.fn((key: string) => key === 'isOptionalAuth'),
    };
    const jwt = { verify: vi.fn() };
    const guard = new JwtAuthGuard(reflector as never, jwt as never, mockPrisma as never);
    await expect(guard.canActivate(context({ headers: {} }) as never)).resolves.toBe(true);
  });
  it('accepts valid token', async () => {
    const guard = new JwtAuthGuard(
      { getAllAndOverride: vi.fn().mockReturnValue(false) } as never,
      { verify: vi.fn().mockReturnValue({ sub: 'u', role: 'ADMIN' }) } as never,
      mockPrisma as never,
    );
    const req = { headers: { authorization: 'Bearer valid' } } as {
      headers: { authorization?: string };
      user?: { id: string; role: 'USER' | 'ADMIN' };
    };
    await expect(guard.canActivate(context(req) as never)).resolves.toBe(true);
    expect(req.user).toEqual({ id: 'u', role: 'USER' });
  });
});
describe('RolesGuard', () => {
  it('checks roles', () => {
    const user = { headers: {}, user: { id: 'u', role: 'USER' as const } };
    expect(
      new RolesGuard({
        getAllAndOverride: vi.fn().mockReturnValue(['ADMIN']),
      } as never).canActivate(context(user) as never),
    ).toBe(false);
    expect(
      new RolesGuard({ getAllAndOverride: vi.fn().mockReturnValue(['USER']) } as never).canActivate(
        context(user) as never,
      ),
    ).toBe(true);
  });
});
