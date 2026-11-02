import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller.js';
describe('HealthController', () => {
  it('reports healthy dependencies', async () =>
    expect(
      await new HealthController(
        { $queryRaw: vi.fn() } as never,
        { ping: vi.fn() } as never,
      ).health(),
    ).toEqual({ status: 'ok', db: 'ok', redis: 'ok' }));
  it('maps failures', async () =>
    await expect(
      new HealthController(
        { $queryRaw: vi.fn().mockRejectedValue(new Error()) } as never,
        { ping: vi.fn() } as never,
      ).health(),
    ).rejects.toThrow());
});
