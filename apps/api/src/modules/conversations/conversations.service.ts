import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  ConversationCreateInput,
  MessageCreateInput,
  MessagesQueryInput,
} from '@market/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { UserPresenter, publicUserSelect } from '../users/user.presenter.js';

const imageMime = /^image\//;
const audioMime = /^audio\//;
const cursor = (date: Date, id: string) =>
  Buffer.from(JSON.stringify({ date: date.toISOString(), id })).toString('base64url');
const parseCursor = (value?: string): { date: Date; id: string } | undefined => {
  if (!value) return undefined;
  try {
    const raw: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!raw || typeof raw !== 'object') return undefined;
    const item = raw as { date?: unknown; id?: unknown };
    const date = new Date(typeof item.date === 'string' ? item.date : '');
    return !Number.isNaN(date.valueOf()) && typeof item.id === 'string'
      ? { date, id: item.id }
      : undefined;
  } catch {
    return undefined;
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

  async create(userId: string, input: ConversationCreateInput) {
    if (input.recipientId === userId) throw new BadRequestException('You cannot message yourself');
    const recipient = await this.prisma.user.findFirst({
      where: { id: input.recipientId, status: 'ACTIVE' },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (
      input.listingId &&
      !(await this.prisma.listing.findUnique({ where: { id: input.listingId } }))
    )
      throw new NotFoundException('Listing not found');
    if (input.bidId && !(await this.prisma.bid.findUnique({ where: { id: input.bidId } })))
      throw new NotFoundException('Bid not found');
    const pair = [userId, input.recipientId].sort().join(':');
    const listingKey = input.listingId ?? '__none__';
    try {
      const conversation = await this.prisma.conversation.create({
        data: {
          participantPairKey: pair,
          listingDedupKey: listingKey,
          listingId: input.listingId ?? null,
          bidId: input.bidId ?? null,
          participants: { create: [{ userId }, { userId: input.recipientId }] },
        },
      });
      return this.get(userId, conversation.id);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
        throw error;
      const existing = await this.prisma.conversation.findUnique({
        where: {
          participantPairKey_listingDedupKey: {
            participantPairKey: pair,
            listingDedupKey: listingKey,
          },
        },
      });
      if (!existing) throw error;
      return this.get(userId, existing.id);
    }
  }

  async list(userId: string, query: { cursor?: string; limit: number }) {
    const all = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: this.include(),
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    });
    const decoded = parseCursor(query.cursor);
    const filtered = decoded
      ? all.filter((row) => {
          const activity = row.lastMessageAt ?? row.createdAt;
          return (
            activity < decoded.date ||
            (activity.getTime() === decoded.date.getTime() && row.id < decoded.id)
          );
        })
      : all;
    const rows = filtered.slice(0, query.limit + 1);
    const items = await Promise.all(
      rows.slice(0, query.limit).map((row) => this.presentConversation(row, userId)),
    );
    const last = rows[query.limit - 1];
    return {
      items,
      nextCursor:
        rows.length > query.limit && last
          ? cursor(last.lastMessageAt ?? last.createdAt, last.id)
          : null,
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
    const all = await this.prisma.message.findMany({
      where: { conversationId },
      include: { sender: { select: publicUserSelect }, attachments: { include: { upload: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const decoded = parseCursor(query.cursor);
    const filtered = decoded
      ? all.filter(
          (row) =>
            row.createdAt < decoded.date ||
            (row.createdAt.getTime() === decoded.date.getTime() && row.id < decoded.id),
        )
      : all;
    const rows = filtered.slice(0, query.limit + 1);
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
    const message = await this.prisma.$transaction(async (tx) => {
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
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });
    const presented = await this.presentMessage(message);
    this.events.emit('message.created', {
      message: presented,
      senderId: userId,
      participantIds: participants.map((p) => p.userId),
    });
    return presented;
  }

  async read(userId: string, conversationId: string, lastMessageId: string) {
    await this.assertParticipant(userId, conversationId);
    const message = await this.prisma.message.findFirst({
      where: { id: lastMessageId, conversationId },
    });
    if (!message) throw new BadRequestException('Message does not belong to conversation');
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!participant || !participant.lastReadMessageId) {
      await this.prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadMessageId: lastMessageId },
      });
      return;
    }
    const prior = await this.prisma.message.findUnique({
      where: { id: participant.lastReadMessageId },
    });
    if (
      !prior ||
      message.createdAt > prior.createdAt ||
      (message.createdAt.getTime() === prior.createdAt.getTime() && message.id > prior.id)
    )
      await this.prisma.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadMessageId: lastMessageId },
      });
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
      updatedAt: c.createdAt,
    };
  }
}
