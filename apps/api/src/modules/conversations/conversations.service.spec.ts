import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../common/auth.js';
import { describe, expect, it, vi } from 'vitest';
import { ConversationsService } from './conversations.service.js';

describe('ConversationsService', () => {
  const user = (id: string): AuthUser => ({ id, role: 'USER' });
  const setup = () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: 'u2' }),
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', role: 'USER' }),
      },
      listing: { findUnique: vi.fn() },
      bid: { findUnique: vi.fn() },
      conversation: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
    await expect(service.create(user('u1'), { recipientId: 'u1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(user('u1'), { recipientId: 'u2' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    prisma.conversation.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'x' }),
    );
    prisma.conversation.findUnique.mockResolvedValueOnce({ id: 'c1' });
    vi.spyOn(service, 'get').mockResolvedValue({ id: 'c1' });
    await expect(service.create(user('u1'), { recipientId: 'u2' })).resolves.toEqual({ id: 'c1' });
  });
  it('retries a transient conversation write conflict', async () => {
    const { service, prisma } = setup();
    prisma.conversation.create
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('write conflict', {
          code: 'P2034',
          clientVersion: 'x',
        }),
      )
      .mockResolvedValueOnce({ id: 'c1' });
    vi.spyOn(service, 'get').mockResolvedValue({ id: 'c1' });

    await expect(service.create(user('u1'), { recipientId: 'u2' })).resolves.toEqual({ id: 'c1' });
    expect(prisma.conversation.create).toHaveBeenCalledTimes(2);
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

  it('enforces listing visibility rules when creating conversation', async () => {
    const { service, prisma } = setup();
    prisma.listing.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.create(user('u1'), { recipientId: 'u2', listingId: 'l_missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // DRAFT listing, caller is not owner and not admin
    prisma.listing.findUnique.mockResolvedValueOnce({
      id: 'l1',
      ownerId: 'u_other',
      status: 'DRAFT',
    });
    await expect(
      service.create(user('u1'), { recipientId: 'u2', listingId: 'l1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // REMOVED listing, caller is not owner and not admin
    prisma.listing.findUnique.mockResolvedValueOnce({
      id: 'l1',
      ownerId: 'u_other',
      status: 'REMOVED',
    });
    await expect(
      service.create(user('u1'), { recipientId: 'u2', listingId: 'l1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // DRAFT listing, caller is owner
    prisma.listing.findUnique.mockResolvedValueOnce({ id: 'l1', ownerId: 'u1', status: 'DRAFT' });
    prisma.conversation.create.mockResolvedValueOnce({ id: 'c1' });
    vi.spyOn(service, 'get').mockResolvedValueOnce({ id: 'c1' });
    await expect(
      service.create(user('u1'), { recipientId: 'u2', listingId: 'l1' }),
    ).resolves.toEqual({
      id: 'c1',
    });

    // DRAFT listing, caller is admin
    prisma.listing.findUnique.mockResolvedValueOnce({
      id: 'l1',
      ownerId: 'u_other',
      status: 'DRAFT',
    });
    prisma.conversation.create.mockResolvedValueOnce({ id: 'c2' });
    vi.spyOn(service, 'get').mockResolvedValueOnce({ id: 'c2' });
    await expect(
      service.create({ id: 'u_admin', role: 'ADMIN' }, { recipientId: 'u2', listingId: 'l1' }),
    ).resolves.toEqual({ id: 'c2' });
  });

  it('enforces bid visibility and recipient matching rules when creating conversation', async () => {
    const { service, prisma } = setup();
    prisma.bid.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.create(user('u1'), { recipientId: 'u2', bidId: 'b_missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Caller is neither bidder nor listing owner
    prisma.bid.findUnique.mockResolvedValueOnce({
      id: 'b1',
      bidderId: 'u_bidder',
      listingId: 'l1',
      listing: { id: 'l1', ownerId: 'u_owner' },
    });
    await expect(
      service.create(user('u_stranger'), { recipientId: 'u_owner', bidId: 'b1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Caller is bidder, but recipient is not owner
    prisma.bid.findUnique.mockResolvedValueOnce({
      id: 'b1',
      bidderId: 'u_bidder',
      listingId: 'l1',
      listing: { id: 'l1', ownerId: 'u_owner' },
    });
    await expect(
      service.create(user('u_bidder'), { recipientId: 'u_other', bidId: 'b1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Caller is bidder, recipient is owner -> success
    prisma.bid.findUnique.mockResolvedValueOnce({
      id: 'b1',
      bidderId: 'u_bidder',
      listingId: 'l1',
      listing: { id: 'l1', ownerId: 'u_owner' },
    });
    prisma.conversation.create.mockResolvedValueOnce({ id: 'c_bid' });
    vi.spyOn(service, 'get').mockResolvedValueOnce({ id: 'c_bid' });
    await expect(
      service.create(user('u_bidder'), { recipientId: 'u_owner', bidId: 'b1' }),
    ).resolves.toEqual({ id: 'c_bid' });
    expect(prisma.conversation.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listingId: 'l1', listingDedupKey: 'l1' }),
      }),
    );

    // Caller is owner, recipient is bidder -> success
    prisma.bid.findUnique.mockResolvedValueOnce({
      id: 'b1',
      bidderId: 'u_bidder',
      listingId: 'l1',
      listing: { id: 'l1', ownerId: 'u_owner' },
    });
    prisma.conversation.create.mockResolvedValueOnce({ id: 'c_owner' });
    vi.spyOn(service, 'get').mockResolvedValueOnce({ id: 'c_owner' });
    await expect(
      service.create(user('u_owner'), { recipientId: 'u_bidder', bidId: 'b1' }),
    ).resolves.toEqual({ id: 'c_owner' });
  });

  it('does not regress a conversation lastMessageAt that is already in the future', async () => {
    const { service, prisma } = setup();
    prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    const mockCreatedAt = new Date('2026-11-03T10:00:00Z');
    const futureLastMessageAt = new Date('2026-11-04T10:00:00Z');
    prisma.conversation.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.message.create.mockResolvedValue({
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      type: 'TEXT',
      body: 'hello',
      voiceDurationSec: null,
      createdAt: mockCreatedAt,
      sender: { id: 'u1', displayName: 'User 1' },
      attachments: [],
    });

    await service.send('u1', 'c1', { type: 'TEXT', body: 'hello' });

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'c1',
        lastMessageAt: { lt: mockCreatedAt },
      },
      data: { lastMessageAt: mockCreatedAt },
    });
    expect(mockCreatedAt.getTime()).toBeLessThan(futureLastMessageAt.getTime());
  });
});
