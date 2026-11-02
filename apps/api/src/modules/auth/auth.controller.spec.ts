import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
const response = () => ({ cookie: vi.fn(), clearCookie: vi.fn() });
const service = {
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
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
describe('AuthController', () => {
  it('sets and clears refresh cookies', async () => {
    const c = new AuthController(service as never, env);
    service.register.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
    const res = response();
    await expect(c.register({}, res as never)).resolves.toEqual({
      accessToken: 'a',
      user: {},
    });
    expect(res.cookie).toHaveBeenCalled();
    service.logout.mockResolvedValue(undefined);
    await c.logout({ cookies: { refresh_token: 'r' } } as never, res as never);
    expect(res.clearCookie).toHaveBeenCalled();
  });
  it('delegates remaining actions', async () => {
    const c = new AuthController(service as never, env);
    service.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
    service.refresh.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
    service.me.mockResolvedValue({ id: 'u' });
    const res = response();
    await c.login({}, res as never);
    await c.refresh({ cookies: { refresh_token: 'r' } } as never, res as never);
    await expect(c.me({ id: 'u', role: 'USER' })).resolves.toEqual({ id: 'u' });
  });
});
