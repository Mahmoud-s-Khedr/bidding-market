import { describe, expect, it, vi } from 'vitest';
import { NotificationsController } from './notifications.controller.js';
describe('NotificationsController', () => {
  it('delegates all notification routes', async () => {
    const service = { list: vi.fn(), unreadCount: vi.fn(), read: vi.fn(), readAll: vi.fn() };
    const controller = new NotificationsController(service as never);
    const user = { id: 'u1', role: 'USER' as const };
    await controller.list(user, { limit: 2 });
    await controller.unreadCount(user);
    await controller.read(user, { id: 'n1' });
    await controller.readAll(user, {});
    expect(service.readAll).toHaveBeenCalledWith('u1');
  });
});
