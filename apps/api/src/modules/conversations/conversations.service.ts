import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  ConversationCreateInput,
  MessageCreateInput,
  MessagesQueryInput,
} from '@market/shared';
import type { AuthUser } from '../../common/auth.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { UserPresenter, publicUserSelect } from '../users/user.presenter.js';
import {
  conversationKeys,
  NO_LISTING_DEDUP_KEY,
  type ConversationDedupKeys,
} from './conversations.keys.js';

export { conversationKeys, NO_LISTING_DEDUP_KEY, type ConversationDedupKeys };

const imageMime = /^image\//;
const audioMime = /^audio\//;
const cursor = (date: Date, id: string) =>
  Buffer.from(JSON.stringify({ date: date.toISOString(), id })).toString('base64url');
const parseCursor = (value?: string): { date: Date; id: string } | undefined => {
  if (!value) return undefined;
  try {
    const raw: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Invalid cursor');
    const item = raw as { date?: unknown; id?: unknown };
    const date = new Date(typeof item.date === 'string' ? item.date : '');
    if (Number.isNaN(date.valueOf()) || typeof item.id !== 'string')
      throw new BadRequestException('Invalid cursor');
    return { date, id: item.id };
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
};

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly users: UserPresenter,
    private readonly events: EventEmitter2,
  ) {}

  async create(caller: AuthUser, input: ConversationCreateInput) {
    const userId = caller.id;
    const userRole = caller.role;
    let listingId = input.listingId;
    if (input.recipientId === userId) throw new BadRequestException('You cannot message yourself');
    const recipient = await this.prisma.user.findFirst({
      where: { id: input.recipientId, status: 'ACTIVE' },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');

    if (input.listingId) {
      const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId } });
      if (!listing) throw new NotFoundException('Listing not found');
      if (listing.status === 'DRAFT' || listing.status === 'REMOVED') {
        const isOwner = userId === listing.ownerId;
        const isAdmin = userRole === 'ADMIN';
        if (!isOwner && !isAdmin) {
          throw new NotFoundException('Listing not found');
        }
      }
    }

    if (input.bidId) {
      const bid = await this.prisma.bid.findUnique({
        where: { id: input.bidId },
        include: {
          listing: {
            select: { id: true, ownerId: true },
          },
        },
      });
      if (!bid) throw new NotFoundException('Bid not found');
      const isBidder = userId === bid.bidderId;
      const isOwner = userId === bid.listing.ownerId;
      if (!isBidder && !isOwner) {
        throw new NotFoundException('Bid not found');
      }
      const expectedRecipientId = isBidder ? bid.listing.ownerId : bid.bidderId;
      if (input.recipientId !== expectedRecipientId) {
        throw new NotFoundException('Bid not found');
      }
      if (input.listingId && input.listingId !== bid.listingId) {
        throw new NotFoundException('Bid not found');
      }
      listingId ??= bid.listingId;
    }

    const keys = conversationKeys(userId, input.recipientId, listingId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const conversation = await this.prisma.conversation.create({
          data: {
            ...keys,
            listingId: listingId ?? null,
            bidId: input.bidId ?? null,
            lastMessageAt: new Date(),
            participants: { create: [{ userId }, { userId: input.recipientId }] },
          },
        });
        return this.get(userId, conversation.id);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
        const existing = await this.prisma.conversation.findUnique({
          where: { participantPairKey_listingDedupKey: keys },
        });
        if (existing) return this.get(userId, existing.id);
        if (error.code !== 'P2034' || attempt === 2) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
      }
    }
    throw new Error('Conversation creation retry exhausted');
  }

  async list(userId: string, query: { cursor?: string; limit: number }) {
    const decoded = parseCursor(query.cursor);
    const rows = await this.prisma.conversation.findMany({
      where: {
        participants: { some: { userId } },
        ...(decoded
          ? {
              OR: [
                { lastMessageAt: { lt: decoded.date } },
                { lastMessageAt: decoded.date, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      include: this.include(),
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const items = await Promise.all(
      rows.slice(0, query.limit).map((row) => this.presentConversation(row, userId)),
    );
    const last = rows[query.limit - 1];
    return {
      items,
      nextCursor: rows.length > query.limit && last ? cursor(last.lastMessageAt, last.id) : null,
    };
  }

  async get(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, participants: { some: { userId } } },
      include: this.include(),
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.presentConversation(conversation, userId);
  }

  async messages(userId: string, conversationId: string, query: MessagesQueryInput) {
    await this.assertParticipant(userId, conversationId);
    const decoded = parseCursor(query.cursor);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(decoded
          ? {
              OR: [
                { createdAt: { lt: decoded.date } },
                { createdAt: decoded.date, id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      include: { sender: { select: publicUserSelect }, attachments: { include: { upload: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const items = await Promise.all(
      rows.slice(0, query.limit).map((row) => this.presentMessage(row)),
    );
    const last = rows[query.limit - 1];
    return {
      items,
      nextCursor: rows.length > query.limit && last ? cursor(last.createdAt, last.id) : null,
    };
  }

  async send(userId: string, conversationId: string, input: MessageCreateInput) {
    const participants = await this.assertParticipant(userId, conversationId);
    const attachmentIds = input.attachmentIds ?? [];
    await this.validateAttachments(userId, input, attachmentIds);
    let message;
    try {
      message = await this.prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            conversationId,
            senderId: userId,
            type: input.type,
            body: input.body ?? null,
            voiceDurationSec: input.voiceDurationSec ?? null,
            attachments: { create: attachmentIds.map((uploadId: string) => ({ uploadId })) },
          },
          include: {
            sender: { select: publicUserSelect },
            attachments: { include: { upload: true } },
          },
        });
        await tx.conversation.updateMany({
          where: {
            id: conversationId,
            lastMessageAt: { lt: created.createdAt },
          },
          data: { lastMessageAt: created.createdAt },
        });
        return created;
      });
    } catch (error) {
      // The unique uploadId constraint closes the race between validation and insert.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new BadRequestException('Upload is already attached to a message');
      throw error;
    }
    const presented = await this.presentMessage(message);
    this.events.emit('message.created', {
      message: presented,
      senderId: userId,
      participantIds: participants.map((p) => p.userId),
    });
    return presented;
  }

  async read(userId: string, conversationId: string, lastMessageId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${conversationId}:${userId}`}))`;
      const participant = await tx.conversationParticipant.findUnique({
        where: { conversationId_userId: { conversationId, userId } },
      });
      if (!participant) throw new NotFoundException('Conversation not found');
      const message = await tx.message.findFirst({ where: { id: lastMessageId, conversationId } });
      if (!message) throw new BadRequestException('Message does not belong to conversation');
      const prior = participant.lastReadMessageId
        ? await tx.message.findUnique({ where: { id: participant.lastReadMessageId } })
        : null;
      if (
        !prior ||
        message.createdAt > prior.createdAt ||
        (message.createdAt.getTime() === prior.createdAt.getTime() && message.id > prior.id)
      )
        await tx.conversationParticipant.update({
          where: { conversationId_userId: { conversationId, userId } },
          data: { lastReadMessageId: lastMessageId },
        });
    });
    this.events.emit('message.read', { conversationId, userId, lastMessageId });
  }

  async countUnreadForUser(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS count FROM "ConversationParticipant" cp
      JOIN "Message" m ON m."conversationId" = cp."conversationId"
      LEFT JOIN "Message" lr ON lr.id = cp."lastReadMessageId"
      WHERE cp."userId" = ${userId} AND m."senderId" <> ${userId}
        AND (
          lr.id IS NULL
          OR m."createdAt" > lr."createdAt"
          OR (m."createdAt" = lr."createdAt" AND m.id > lr.id)
        )
    `);
    return Number(rows[0]?.count ?? 0n);
  }

  private include() {
    return {
      participants: { include: { user: { select: publicUserSelect } } },
      messages: {
        take: 1,
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        include: {
          sender: { select: publicUserSelect },
          attachments: { include: { upload: true } },
        },
      },
      listing: { select: { id: true, title: true, status: true } },
    };
  }
  private async assertParticipant(userId: string, conversationId: string) {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
    });
    if (!participants.some((participant) => participant.userId === userId))
      throw new NotFoundException('Conversation not found');
    return participants;
  }
  private async validateAttachments(userId: string, input: MessageCreateInput, ids: string[]) {
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate attachment IDs');
    if (input.type === 'TEXT' && ids.length > 0)
      throw new BadRequestException('Text messages cannot have attachments');
    if (
      input.type === 'VOICE' &&
      (input.voiceDurationSec === undefined ||
        input.voiceDurationSec < 1 ||
        input.voiceDurationSec > 600)
    )
      throw new BadRequestException('Voice duration must be 1 to 600 seconds');
    if (!ids.length) return;
    const uploads = await this.prisma.upload.findMany({ where: { id: { in: ids } } });
    if (uploads.length !== ids.length)
      throw new BadRequestException('One or more uploads not found');
    if (await this.prisma.messageAttachment.findFirst({ where: { uploadId: { in: ids } } }))
      throw new BadRequestException('Upload is already attached to a message');
    for (const upload of uploads) {
      if (
        upload.uploaderId !== userId ||
        upload.status !== 'READY' ||
        upload.purpose !== 'MESSAGE_ATTACHMENT'
      )
        throw new BadRequestException('Attachments must be ready message uploads owned by sender');
      if (input.type === 'IMAGE' && !imageMime.test(upload.mimeType))
        throw new BadRequestException('Image messages require image attachments');
      if (input.type === 'VOICE' && !audioMime.test(upload.mimeType))
        throw new BadRequestException('Voice messages require audio attachments');
    }
  }
  private async presentMessage(message: {
    id: string;
    conversationId: string;
    type: 'TEXT' | 'IMAGE' | 'FILE' | 'VOICE';
    body: string | null;
    voiceDurationSec: number | null;
    createdAt: Date;
    sender: Parameters<UserPresenter['toPublicUser']>[0];
    attachments: {
      upload: { id: string; key: string; fileName: string; mimeType: string; sizeBytes: number };
    }[];
  }) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      sender: await this.users.toPublicUser(message.sender),
      type: message.type,
      body: message.body,
      voiceDurationSec: message.voiceDurationSec,
      attachments: await Promise.all(
        message.attachments.map(async ({ upload }) => ({
          id: upload.id,
          key: upload.key,
          fileName: upload.fileName,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          url: await this.storage.presignGet(upload.key),
        })),
      ),
      createdAt: message.createdAt,
    };
  }
  private async presentConversation(
    conversation: Awaited<ReturnType<PrismaService['conversation']['findFirst']>> & object,
    userId: string,
  ): Promise<object> {
    const c = conversation as never as {
      id: string;
      listingId: string | null;
      bidId: string | null;
      agreementId: string | null;
      createdAt: Date;
      updatedAt: Date;
      participants: {
        userId: string;
        lastReadMessageId: string | null;
        user: Parameters<UserPresenter['toPublicUser']>[0];
      }[];
      messages: Parameters<ConversationsService['presentMessage']>[0][];
      listing: { id: string; title: string; status: string } | null;
    };
    const mine = c.participants.find((p) => p.userId === userId)!;
    const other = c.participants.find((p) => p.userId !== userId)!;
    const marker = mine.lastReadMessageId
      ? await this.prisma.message.findUnique({ where: { id: mine.lastReadMessageId } })
      : null;
    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId: c.id,
        senderId: { not: userId },
        ...(marker
          ? {
              OR: [
                { createdAt: { gt: marker.createdAt } },
                { createdAt: marker.createdAt, id: { gt: marker.id } },
              ],
            }
          : {}),
      },
    });
    return {
      id: c.id,
      listingId: c.listingId,
      bidId: c.bidId,
      agreementId: c.agreementId,
      participants: await Promise.all(c.participants.map((p) => this.users.toPublicUser(p.user))),
      otherParticipant: await this.users.toPublicUser(other.user),
      lastMessage: c.messages[0] ? await this.presentMessage(c.messages[0]) : null,
      unreadCount,
      listing: c.listing,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
