import { describe, expect, it, vi } from 'vitest';
import { DashboardController } from './dashboard.controller.js';
describe('DashboardController', () => {
  it('uses current user', async () => {
    const summary = vi.fn();
    const controller = new DashboardController({ summary } as never);
    await controller.summary({ id: 'u' } as never);
    expect(summary).toHaveBeenCalledWith('u');
  });
});
