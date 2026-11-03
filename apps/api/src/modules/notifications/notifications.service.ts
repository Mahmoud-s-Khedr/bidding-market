import { Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationQueryInput } from '@market/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

export interface NotifyInput {
  type:
    | 'BID_RECEIVED'
    | 'BID_UPDATED'
    | 'BID_COUNTERED'
    | 'BID_ACCEPTED'
    | 'BID_REJECTED'
    | 'MESSAGE_RECEIVED'
    | 'DELIVERABLE_SUBMITTED'
    | 'DELIVERABLE_ACCEPTED'
    | 'REVISION_REQUESTED'
    | 'AGREEMENT_COMPLETED'
    | 'AGREEMENT_CANCELLED'
    | 'REPORT_RESOLVED'
    | 'REVIEW_RECEIVED';
  title: string;
  body: string;
  link?: string;
  data?: object;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async notify(userId: string, input: NotifyInput) {
    const notification = await this.prisma.notification.create({
      data: { userId, ...input, link: input.link ?? null, data: input.data },
    });
    this.realtime.emitToUser(userId, 'notification:new', notification);
    return notification;
  }

  async list(userId: string, query: NotificationQueryInput) {
    const marker = query.cursor
      ? await this.prisma.notification.findFirst({
          where: { id: query.cursor, userId },
          select: { activityAt: true, id: true },
        })
      : null;
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        ...(query.unread ? { readAt: null } : {}),
        ...(marker
          ? {
              OR: [
                { activityAt: { lt: marker.activityAt } },
                { activityAt: marker.activityAt, id: { lt: marker.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ activityAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    return { items, nextCursor: rows.length > query.limit ? (items.at(-1)?.id ?? null) : null };
  }
  unreadCount(userId: string) {
    return this.prisma.notification
      .count({ where: { userId, readAt: null } })
      .then((count) => ({ count }));
  }
  async read(userId: string, id: string) {
    const changed = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    if (changed.count === 0) throw new NotFoundException('Notification not found');
  }
  async readAll(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  @OnEvent('message.created')
  async onMessageCreated(event: {
    message: { id: string; conversationId: string; body: string | null };
    senderId: string;
    participantIds: string[];
  }): Promise<void> {
    const recipientId = event.participantIds.find((id) => id !== event.senderId);
    if (!recipientId) return;
    const data = { conversationId: event.message.conversationId, messageId: event.message.id };
    const notification = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${recipientId}:${event.message.conversationId}`}))`;
      const existing = await tx.notification.findFirst({
        where: {
          userId: recipientId,
          type: 'MESSAGE_RECEIVED',
          conversationId: event.message.conversationId,
          readAt: null,
        },
      });
      if (existing)
        return tx.notification.update({
          where: { id: existing.id },
          data: { body: event.message.body || 'Sent an attachment', data, activityAt: new Date() },
        });
      return tx.notification.create({
        data: {
          userId: recipientId,
          type: 'MESSAGE_RECEIVED',
          title: 'New message',
          body: event.message.body || 'Sent an attachment',
          link: `/conversations/${event.message.conversationId}`,
          data,
          conversationId: event.message.conversationId,
        },
      });
    });
    this.realtime.emitToUser(recipientId, 'notification:new', notification);
  }
}
