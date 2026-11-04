import { describe, expect, it, vi } from 'vitest';
import { ConversationsController } from './conversations.controller.js';
describe('ConversationsController', () => {
  it('delegates every route to its service', async () => {
    const service = {
      list: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      messages: vi.fn(),
      send: vi.fn(),
      read: vi.fn(),
    };
    const controller = new ConversationsController(service as never);
    const user = { id: 'u1', role: 'USER' as const };
    await controller.list(user, { limit: 2 });
    await controller.create(user, { recipientId: 'u2' });
    await controller.get(user, { id: 'c1' });
    await controller.messages(user, { id: 'c1' }, { limit: 2 });
    await controller.send(user, { id: 'c1' }, { type: 'TEXT', body: 'x' });
    await controller.read(user, { id: 'c1' }, { lastMessageId: 'm1' });
    expect(service.read).toHaveBeenCalledWith('u1', 'c1', 'm1');
  });
});
