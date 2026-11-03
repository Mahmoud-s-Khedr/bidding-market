import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Server } from 'node:http';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type Redis from 'ioredis';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';
import { REDIS } from '../src/redis/redis.module.js';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const once = <T>(socket: Socket, event: string) =>
  new Promise<T>((resolve, reject) => {
    if (event === 'connect' && socket.connected) {
      resolve(undefined as unknown as T);
      return;
    }
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), 5_000);
    socket.once(event, (value: T) => {
      clearTimeout(timer);
      resolve(value);
    });
    if (event === 'connect') {
      socket.once('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    }
  });
const ack = (socket: Socket, event: string, payload: unknown) =>
  new Promise<{ ok: boolean }>((resolve) => socket.emit(event, payload, resolve));
const noEvent = (socket: Socket, event: string, ms = 150) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    socket.once(event, () => {
      clearTimeout(timer);
      reject(new Error(`${event} unexpectedly emitted`));
    });
  });

describe('realtime', () => {
  let app: INestApplication;
  beforeEach(async () => {
    await resetDb();
    await app?.close();
    app = await createTestApp();
    await app.listen(0);
  });
  afterAll(async () => app?.close());
  const url = () =>
    `http://127.0.0.1:${((app.getHttpServer() as Server).address() as { port: number }).port}/rt`;
  const socket = (token: string) =>
    io(url(), { auth: { token }, forceNew: true, reconnection: false });
  const pair = async () => {
    const a = await registerAndLogin(app, `ra-${crypto.randomUUID()}@test.local`);
    const b = await registerAndLogin(app, `rb-${crypto.randomUUID()}@test.local`);
    const c = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: b.user.id });
    return { a, b, id: c.body.id as string };
  };

  it('rejects a bad token at handshake', async () => {
    const s = socket('bad');
    await expect(once<Error>(s, 'connect_error')).resolves.toBeTruthy();
    s.close();
  });
  it('rejects a banned user at handshake', async () => {
    const a = await registerAndLogin(app, 'banned-handshake@test.local');
    await prisma.user.update({ where: { id: a.user.id }, data: { status: 'BANNED' } });
    const s = socket(a.accessToken);
    await expect(once<Error>(s, 'connect_error')).resolves.toBeTruthy();
    s.close();
  });
  it('rejects an expired token at handshake', async () => {
    const a = await registerAndLogin(app, 'expired-handshake@test.local');
    const token = app.get(JwtService).sign({ sub: a.user.id }, { expiresIn: -1 });
    const s = socket(token);
    await expect(once<Error>(s, 'connect_error')).resolves.toBeTruthy();
    s.close();
  });
  it('disconnects a user banned after connecting on their next event', async () => {
    const { a, id } = await pair();
    const s = socket(a.accessToken);
    await once(s, 'connect');
    await prisma.user.update({ where: { id: a.user.id }, data: { status: 'BANNED' } });
    const disconnected = once(s, 'disconnect');
    expect((await ack(s, 'conversation:join', { conversationId: id })).ok).toBe(false);
    await disconnected;
    s.close();
  });
  it('disconnects a user whose token expired after connecting on their next event', async () => {
    const a = await registerAndLogin(app, 'expired-mid@test.local');
    const { id } = await pair();
    const token = app.get(JwtService).sign({ sub: a.user.id }, { expiresIn: 1 });
    const s = socket(token);
    await once(s, 'connect');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const disconnected = once(s, 'disconnect');
    expect((await ack(s, 'conversation:join', { conversationId: id })).ok).toBe(false);
    await disconnected;
    s.close();
  });
  it('does not deliver a message event to a banned recipient', async () => {
    const { a, b, id } = await pair();
    const s = socket(b.accessToken);
    await once(s, 'connect');
    await prisma.user.update({ where: { id: b.user.id }, data: { status: 'BANNED' } });
    const absent = noEvent(s, 'message:new');
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'hidden' })
      .expect(201);
    await absent;
    s.close();
  });
  it('delivers REST-created messages to the other participant', async () => {
    const { a, b, id } = await pair();
    const sb = socket(b.accessToken);
    await once(sb, 'connect');
    const event = once<{ body: string }>(sb, 'message:new');
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'hello' })
      .expect(201);
    expect((await event).body).toBe('hello');
    sb.close();
  });
  it('does not echo typing to the sender or stranger', async () => {
    const { a, b, id } = await pair();
    const outsider = await registerAndLogin(app, 'typing-outsider@test.local');
    const sa = socket(a.accessToken);
    const sb = socket(b.accessToken);
    const so = socket(outsider.accessToken);
    await Promise.all([once(sa, 'connect'), once(sb, 'connect'), once(so, 'connect')]);
    const sender = noEvent(sa, 'typing');
    const stranger = noEvent(so, 'typing');
    const peer = once<{ userId: string }>(sb, 'typing');
    expect((await ack(sa, 'typing', { conversationId: id, isTyping: true })).ok).toBe(true);
    expect((await peer).userId).toBe(a.user.id);
    await Promise.all([sender, stranger]);
    sa.close();
    sb.close();
    so.close();
  });
  it('throttles repeated typing true events', async () => {
    const { a, b, id } = await pair();
    const sa = socket(a.accessToken);
    const sb = socket(b.accessToken);
    await Promise.all([once(sa, 'connect'), once(sb, 'connect')]);
    expect((await ack(sa, 'typing', { conversationId: id, isTyping: true })).ok).toBe(true);
    expect((await ack(sa, 'typing', { conversationId: id, isTyping: true })).ok).toBe(false);
    sa.close();
    sb.close();
  });
  it('never throttles a typing false event', async () => {
    const { a, b, id } = await pair();
    const sa = socket(a.accessToken);
    const sb = socket(b.accessToken);
    await Promise.all([once(sa, 'connect'), once(sb, 'connect')]);
    await ack(sa, 'typing', { conversationId: id, isTyping: true });
    expect((await ack(sa, 'typing', { conversationId: id, isTyping: false })).ok).toBe(true);
    sa.close();
    sb.close();
  });
  it('rejects a non-participant join while a participant is connected', async () => {
    const { a, b, id } = await pair();
    const sa = socket(a.accessToken);
    const sb = socket(b.accessToken);
    const o = await registerAndLogin(app, 'join-outsider@test.local');
    const so = socket(o.accessToken);
    await Promise.all([once(sa, 'connect'), once(sb, 'connect'), once(so, 'connect')]);
    expect((await ack(so, 'conversation:join', { conversationId: id })).ok).toBe(false);
    sa.close();
    sb.close();
    so.close();
  });
  it('accepts a participant joining and leaving a conversation room', async () => {
    const { a, id } = await pair();
    const s = socket(a.accessToken);
    await once(s, 'connect');
    expect((await ack(s, 'conversation:join', { conversationId: id })).ok).toBe(true);
    expect((await ack(s, 'conversation:leave', { conversationId: id })).ok).toBe(true);
    s.close();
  });
  it('rejects null and invalid join payloads', async () => {
    const { a } = await pair();
    const s = socket(a.accessToken);
    await once(s, 'connect');
    expect((await ack(s, 'conversation:join', null)).ok).toBe(false);
    expect((await ack(s, 'conversation:join', undefined)).ok).toBe(false);
    expect((await ack(s, 'conversation:join', { nope: true })).ok).toBe(false);
    s.close();
  });
  it('rejects a non-participant read event', async () => {
    const { id } = await pair();
    const o = await registerAndLogin(app, 'read-outsider@test.local');
    const s = socket(o.accessToken);
    await once(s, 'connect');
    expect(
      (await ack(s, 'message:read', { conversationId: id, lastMessageId: 'missing' })).ok,
    ).toBe(false);
    s.close();
  });
  it('does not move a socket read marker backwards', async () => {
    const { a, b, id } = await pair();
    const one = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'one' });
    const two = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'two' });
    const s = socket(b.accessToken);
    await once(s, 'connect');
    expect(
      (await ack(s, 'message:read', { conversationId: id, lastMessageId: two.body.id })).ok,
    ).toBe(true);
    expect(
      (await ack(s, 'message:read', { conversationId: id, lastMessageId: one.body.id })).ok,
    ).toBe(true);
    expect(
      (await request(app.getHttpServer()).get('/api/v1/conversations').set(auth(b.accessToken)))
        .body.items[0].unreadCount,
    ).toBe(0);
    s.close();
  });
  it('emits online once for two sockets and offline after the last disconnect', async () => {
    const { a, b } = await pair();
    const observer = socket(b.accessToken);
    await once(observer, 'connect');
    const first = socket(a.accessToken);
    const online = once<{ userId: string; online: boolean }>(observer, 'presence');
    await once(first, 'connect');
    expect(await online).toMatchObject({ userId: a.user.id, online: true });
    const second = socket(a.accessToken);
    const noDuplicate = noEvent(observer, 'presence');
    await once(second, 'connect');
    await noDuplicate;
    first.close();
    await noEvent(observer, 'presence');
    const offline = once<{ online: boolean }>(observer, 'presence');
    second.close();
    expect(await offline).toMatchObject({ online: false });
    observer.close();
  });
  it('does not emit presence to strangers', async () => {
    const { a } = await pair();
    const stranger = await registerAndLogin(app, 'presence-stranger@test.local');
    const observer = socket(stranger.accessToken);
    await once(observer, 'connect');
    const absent = noEvent(observer, 'presence');
    const subject = socket(a.accessToken);
    await once(subject, 'connect');
    await absent;
    subject.close();
    observer.close();
  });
  it('refreshes presence lease for an idle socket', async () => {
    const { a } = await pair();
    app.get(RealtimeGateway).presenceHeartbeatMs = 200;
    const redis = app.get<Redis>(REDIS);
    const s = socket(a.accessToken);
    await once(s, 'connect');
    await redis.expire(`rt:presence:${a.user.id}`, 20);
    expect(await redis.ttl(`rt:presence:${a.user.id}`)).toBeLessThanOrEqual(20);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const ttl = await redis.ttl(`rt:presence:${a.user.id}`);
    expect(ttl).toBeGreaterThan(80);
    s.close();
  });
  it('delivers a message notification over the socket', async () => {
    const { a, b, id } = await pair();
    const s = socket(b.accessToken);
    await once(s, 'connect');
    const notification = once<{ type: string }>(s, 'notification:new');
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'note' })
      .expect(201);
    expect((await notification).type).toBe('MESSAGE_RECEIVED');
    s.close();
  });
});
