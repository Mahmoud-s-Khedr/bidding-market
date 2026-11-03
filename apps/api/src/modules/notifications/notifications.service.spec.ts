import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  const notification = { id: 'n1', createdAt: new Date(), body: 'old' };
  const setup = () => {
    const prisma = {
      notification: {
        create: vi.fn().mockResolvedValue(notification),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
    };
    const realtime = { emitToUser: vi.fn() };
    return {
      service: new NotificationsService(prisma as never, realtime as never),
      prisma,
      realtime,
    };
  };
  it('persists and pushes a notification', async () => {
    const { service, prisma, realtime } = setup();
    await expect(
      service.notify('u1', { type: 'MESSAGE_RECEIVED', title: 'New', body: 'hello' }),
    ).resolves.toEqual(notification);
    expect(prisma.notification.create).toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith('u1', 'notification:new', notification);
  });
  it('paginates, counts, marks one and marks all', async () => {
    const { service, prisma } = setup();
    prisma.notification.findFirst.mockResolvedValue({ id: 'cursor', createdAt: new Date() });
    prisma.notification.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    expect(await service.list('u1', { cursor: 'cursor', limit: 1 })).toEqual({
      items: [{ id: 'a' }],
      nextCursor: 'a',
    });
    prisma.notification.count.mockResolvedValue(3);
    await expect(service.unreadCount('u1')).resolves.toEqual({ count: 3 });
    prisma.notification.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });
    await service.read('u1', 'n1');
    await service.readAll('u1');
  });
  it('hides another users notification and coalesces message notifications', async () => {
    const { service, prisma, realtime } = setup();
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.read('u1', 'other')).rejects.toBeInstanceOf(NotFoundException);
    prisma.notification.findFirst.mockResolvedValue(notification);
    prisma.notification.update.mockResolvedValue({ ...notification, body: 'new' });
    await service.onMessageCreated({
      message: { id: 'm2', conversationId: 'c1', body: 'new' },
      senderId: 'u1',
      participantIds: ['u1', 'u2'],
    });
    expect(prisma.notification.update).toHaveBeenCalled();
    expect(realtime.emitToUser).toHaveBeenCalledWith(
      'u2',
      'notification:new',
      expect.objectContaining({ body: 'new' }),
    );
  });
  it('creates a message notification when no unread one exists', async () => {
    const { service, prisma } = setup();
    prisma.notification.findFirst.mockResolvedValue(null);
    await service.onMessageCreated({
      message: { id: 'm1', conversationId: 'c1', body: null },
      senderId: 'u1',
      participantIds: ['u1', 'u2'],
    });
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u2', body: 'Sent an attachment' }),
      }),
    );
  });
});
