import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import { ConversationsService } from './conversations.service.js';

describe('ConversationsService', () => {
  const setup = () => {
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: 'u2' }) },
      listing: { findUnique: vi.fn() },
      bid: { findUnique: vi.fn() },
      conversation: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      conversationParticipant: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      message: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      upload: { findMany: vi.fn() },
      messageAttachment: { findFirst: vi.fn().mockResolvedValue(null) },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([{ count: 3n }]),
      $transaction: vi.fn((fn: (tx: typeof prisma) => unknown) => Promise.resolve(fn(prisma))),
    };
    const storage = { presignGet: vi.fn().mockResolvedValue('url') };
    const users = {
      toPublicUser: vi.fn((user: { id: string }) => Promise.resolve({ ...user, avatarUrl: null })),
    };
    const events = { emit: vi.fn() };
    return {
      service: new ConversationsService(
        prisma as never,
        storage as never,
        users as never,
        events as never,
      ),
      prisma,
      events,
    };
  };
  it('rejects self and missing recipients, and returns a unique conflict winner', async () => {
    const { service, prisma } = setup();
    await expect(service.create('u1', { recipientId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.create('u1', { recipientId: 'u2' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.conversation.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'x' }),
    );
    prisma.conversation.findUnique.mockResolvedValueOnce({ id: 'c1' });
    vi.spyOn(service, 'get').mockResolvedValue({ id: 'c1' });
    await expect(service.create('u1', { recipientId: 'u2' })).resolves.toEqual({ id: 'c1' });
  });
  it('validates attachment type rules before creating a message', async () => {
    const { service, prisma } = setup();
    prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    await expect(
      service.send('u1', 'c1', { type: 'TEXT', body: 'x', attachmentIds: ['a'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.send('u1', 'c1', { type: 'VOICE', attachmentIds: ['a'], voiceDurationSec: 601 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.upload.findMany.mockResolvedValue([
      {
        id: 'a',
        uploaderId: 'u1',
        status: 'READY',
        purpose: 'MESSAGE_ATTACHMENT',
        mimeType: 'application/pdf',
      },
    ]);
    await expect(
      service.send('u1', 'c1', { type: 'IMAGE', attachmentIds: ['a'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.send('u1', 'c1', { type: 'VOICE', attachmentIds: ['a'], voiceDurationSec: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('moves a read marker forward but never backwards', async () => {
    const { service, prisma } = setup();
    const old = new Date('2020-01-01');
    const recent = new Date('2020-01-02');
    prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: 'u1' }]);
    prisma.message.findFirst
      .mockResolvedValueOnce({ id: 'old', createdAt: old })
      .mockResolvedValueOnce({ id: 'new', createdAt: recent });
    prisma.conversationParticipant.findUnique.mockResolvedValue({ lastReadMessageId: 'new' });
    prisma.message.findUnique.mockResolvedValue({ id: 'new', createdAt: recent });
    await service.read('u1', 'c1', 'old');
    expect(prisma.conversationParticipant.update).not.toHaveBeenCalled();
  });
  it('counts unread messages across conversations for a user', async () => {
    const { service, prisma } = setup();
    await expect(service.countUnreadForUser('u1')).resolves.toBe(3);
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});
