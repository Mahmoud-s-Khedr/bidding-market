import { describe, expect, it, vi } from 'vitest';
import { UsersController } from './users.controller.js';
describe('UsersController', () => {
  it('delegates profile, update and reviews', async () => {
    const users = {
      profile: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      reviews: vi.fn().mockResolvedValue({ items: [] }),
    };
    const c = new UsersController(users as never);
    await c.profile({ id: 'u' });
    await c.update({ id: 'u', role: 'USER' }, { displayName: 'Name' });
    await c.reviews({ id: 'u' }, { limit: 1 });
    expect(users.profile).toHaveBeenCalledWith('u');
    expect(users.update).toHaveBeenCalled();
    expect(users.reviews).toHaveBeenCalledWith('u', undefined, 1);
  });
});
