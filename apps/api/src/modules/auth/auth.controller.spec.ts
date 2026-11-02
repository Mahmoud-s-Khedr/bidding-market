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
describe('AuthController', () => {
  it('sets and clears refresh cookies', async () => {
    const c = new AuthController(service as never);
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
    const c = new AuthController(service as never);
    service.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
    service.refresh.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {} });
    service.me.mockResolvedValue({ id: 'u' });
    const res = response();
    await c.login({}, res as never);
    await c.refresh({ cookies: { refresh_token: 'r' } } as never, res as never);
    await expect(c.me({ id: 'u', role: 'USER' })).resolves.toEqual({ id: 'u' });
  });
});
