import { Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { wsPayloadSchemas } from '@market/shared';
import type Redis from 'ioredis';
import type { Namespace, Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REDIS } from '../../redis/redis.module.js';
import { RealtimeService } from './realtime.service.js';
import { ConversationsService } from '../conversations/conversations.service.js';

interface AuthedSocket extends Socket {
  data: { userId?: string; lastTypingAt?: number; presenceTracked?: boolean; expiresAt?: number };
}

@WebSocketGateway({ namespace: '/rt', cors: { origin: process.env.WEB_ORIGIN, credentials: true } })
export class RealtimeGateway {
  @WebSocketServer() server!: Server;
  private publisher?: Redis;
  private subscriber?: Redis;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly realtime: RealtimeService,
    private readonly conversations: ConversationsService,
  ) {}

  afterInit(namespace: Namespace): void {
    this.realtime.setServer(namespace as unknown as Server);
    this.publisher = this.redis.duplicate();
    this.subscriber = this.redis.duplicate();
    namespace.server.adapter(createAdapter(this.publisher, this.subscriber));
    namespace.use((socket, next) => {
      void this.authenticate(socket as AuthedSocket)
        .then(() => next())
        .catch(() => next(new Error('Unauthorized')));
    });
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    try {
      const userId = socket.data.userId;
      if (!userId) throw new Error('invalid access token');
      await socket.join(`user:${userId}`);
      await this.redis.sadd(`rt:presence:${userId}`, socket.id);
      await this.redis.expire(`rt:presence:${userId}`, 90);
      socket.data.presenceTracked = true;
      if ((await this.redis.scard(`rt:presence:${userId}`)) === 1)
        await this.emitPresence(userId, true);
    } catch {
      socket.emit('connect_error', { message: 'Unauthorized' });
      socket.disconnect(true);
    }
  }

  private async authenticate(socket: AuthedSocket): Promise<void> {
    const token =
      typeof socket.handshake.auth.token === 'string' ? socket.handshake.auth.token : '';
    const payload = this.jwt.verify<{ sub: string; exp?: number }>(token, {
      algorithms: ['HS256'],
    });
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { status: true },
    });
    if (!user || user.status !== 'ACTIVE') throw new Error('invalid access token');
    socket.data.userId = payload.sub;
    socket.data.expiresAt = payload.exp ? payload.exp * 1000 : undefined;
  }

  async handleDisconnect(socket: AuthedSocket): Promise<void> {
    const userId = socket.data.userId;
    if (!userId || !socket.data.presenceTracked) return;
    await this.redis.srem(`rt:presence:${userId}`, socket.id);
    if ((await this.redis.scard(`rt:presence:${userId}`)) === 0) {
      await this.redis.del(`rt:presence:${userId}`);
      await this.emitPresence(userId, false);
    }
  }

  @SubscribeMessage('conversation:join')
  async join(socket: AuthedSocket, raw: unknown): Promise<{ ok: boolean }> {
    const payload = wsPayloadSchemas.conversationJoin.safeParse(raw);
    if (
      !payload.success ||
      !(await this.ensureActive(socket)) ||
      !(await this.isParticipant(socket, payload.data.conversationId))
    )
      return { ok: false };
    await socket.join(`conversation:${payload.data.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('conversation:leave')
  async leave(socket: AuthedSocket, raw: unknown): Promise<{ ok: boolean }> {
    const payload = wsPayloadSchemas.conversationJoin.safeParse(raw);
    if (!payload.success || !(await this.ensureActive(socket))) return { ok: false };
    await socket.leave(`conversation:${payload.data.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('typing')
  async typing(socket: AuthedSocket, raw: unknown): Promise<{ ok: boolean }> {
    const payload = wsPayloadSchemas.typing.safeParse(raw);
    const now = Date.now();
    if (
      !payload.success ||
      !(await this.ensureActive(socket)) ||
      (payload.data.isTyping && now - (socket.data.lastTypingAt ?? 0) < 500) ||
      !(await this.isParticipant(socket, payload.data.conversationId))
    )
      return { ok: false };
    socket.data.lastTypingAt = now;
    const userId = socket.data.userId!;
    const people = await this.participantIds(payload.data.conversationId);
    this.realtime.emitToUsers(
      people.filter((id) => id !== userId),
      'typing',
      { ...payload.data, userId },
    );
    return { ok: true };
  }

  @SubscribeMessage('message:read')
  async read(socket: AuthedSocket, raw: unknown): Promise<{ ok: boolean }> {
    const payload = wsPayloadSchemas.read.safeParse(raw);
    if (
      !payload.success ||
      !(await this.ensureActive(socket)) ||
      !(await this.isParticipant(socket, payload.data.conversationId))
    )
      return { ok: false };
    const userId = socket.data.userId!;
    try {
      await this.conversations.read(
        userId,
        payload.data.conversationId,
        payload.data.lastMessageId,
      );
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @OnEvent('message.created')
  onMessageCreated(event: { participantIds: string[]; message: unknown }): void {
    this.realtime.emitToUsers(event.participantIds, 'message:new', event.message);
  }
  @OnEvent('message.read')
  onMessageRead(event: { conversationId: string; userId: string; lastMessageId: string }): void {
    void this.participantIds(event.conversationId).then((ids) =>
      this.realtime.emitToUsers(ids, 'message:read', event),
    );
  }

  private async isParticipant(socket: AuthedSocket, conversationId: string): Promise<boolean> {
    const userId = socket.data.userId;
    if (!userId) return false;
    return !!(await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    }));
  }
  private async ensureActive(socket: AuthedSocket): Promise<boolean> {
    if (
      !socket.data.userId ||
      (socket.data.expiresAt !== undefined && Date.now() >= socket.data.expiresAt)
    ) {
      socket.disconnect(true);
      return false;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: socket.data.userId },
      select: { status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      socket.disconnect(true);
      return false;
    }
    await this.redis.expire(`rt:presence:${socket.data.userId}`, 90);
    return true;
  }
  private async participantIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }
  private async emitPresence(userId: string, online: boolean): Promise<void> {
    const conversations = await this.prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversation: { select: { participants: { select: { userId: true } } } } },
    });
    const recipients = conversations
      .flatMap((row) => row.conversation.participants.map((p) => p.userId))
      .filter((id) => id !== userId);
    this.realtime.emitToUsers(recipients, 'presence', { userId, online });
  }
}
