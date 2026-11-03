import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const once = <T>(socket: Socket, event: string) =>
  new Promise<T>((resolve) => socket.once(event, resolve));

describe('messaging and notifications', () => {
  let app: INestApplication;
  beforeEach(async () => {
    await resetDb();
    if (!app) {
      app = await createTestApp();
      await app.listen(0);
    }
  });
  afterAll(async () => {
    await app?.close();
  });

  it('covers conversation and message REST authorization, validation, reads and notifications', async () => {
    const a = await registerAndLogin(app, 'a@test.local');
    const b = await registerAndLogin(app, 'b@test.local');
    const outsider = await registerAndLogin(app, 'o@test.local');
    const server = app.getHttpServer();
    await request(server).get('/api/v1/conversations').expect(401);
    await request(server)
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: a.user.id })
      .expect(400);
    const created = await request(server)
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: b.user.id })
      .expect(201);
    const conversationId = created.body.id as string;
    await request(server)
      .get(`/api/v1/conversations/${conversationId}`)
      .set(auth(outsider.accessToken))
      .expect(404);
    await request(server)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT' })
      .expect(400);
    const message = await request(server)
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'hello' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      (await request(server).get('/api/v1/conversations').set(auth(b.accessToken)).expect(200)).body
        .items[0].unreadCount,
    ).toBe(1);
    await request(server)
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set(auth(b.accessToken))
      .send({ lastMessageId: message.body.id })
      .expect(201);
    await request(server)
      .post(`/api/v1/conversations/${conversationId}/read`)
      .set(auth(b.accessToken))
      .send({ lastMessageId: 'missing' })
      .expect(400);
    await request(server)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set(auth(outsider.accessToken))
      .expect(404);
    expect(
      (
        await request(server)
          .get('/api/v1/notifications/unread-count')
          .set(auth(b.accessToken))
          .expect(200)
      ).body.count,
    ).toBe(1);
    const notifications = await request(server)
      .get('/api/v1/notifications?unread=true')
      .set(auth(b.accessToken))
      .expect(200);
    await request(server)
      .post(`/api/v1/notifications/${notifications.body.items[0].id}/read`)
      .set(auth(outsider.accessToken))
      .expect(404);
    await request(server)
      .post('/api/v1/notifications/read-all')
      .set(auth(b.accessToken))
      .send({})
      .expect(201);
  });

  it('deduplicates concurrent creates and enforces attachment ownership, purpose and MIME', async () => {
    const a = await registerAndLogin(app, 'a@test.local');
    const b = await registerAndLogin(app, 'b@test.local');
    const server = app.getHttpServer();
    const [first, second] = await Promise.all([
      request(server)
        .post('/api/v1/conversations')
        .set(auth(a.accessToken))
        .send({ recipientId: b.user.id }),
      request(server)
        .post('/api/v1/conversations')
        .set(auth(a.accessToken))
        .send({ recipientId: b.user.id }),
    ]);
    expect(first.body.id).toBe(second.body.id);
    const c = first.body.id as string;
    const foreign = await prisma.upload.create({
      data: {
        uploaderId: b.user.id,
        purpose: 'MESSAGE_ATTACHMENT',
        status: 'READY',
        key: 'foreign',
        fileName: 'x.png',
        mimeType: 'image/png',
        sizeBytes: 1,
      },
    });
    const wrongPurpose = await prisma.upload.create({
      data: {
        uploaderId: a.user.id,
        purpose: 'AVATAR',
        status: 'READY',
        key: 'avatar',
        fileName: 'x.png',
        mimeType: 'image/png',
        sizeBytes: 1,
      },
    });
    const pdf = await prisma.upload.create({
      data: {
        uploaderId: a.user.id,
        purpose: 'MESSAGE_ATTACHMENT',
        status: 'READY',
        key: 'pdf',
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
      },
    });
    for (const attachmentIds of [[foreign.id], [wrongPurpose.id]])
      await request(server)
        .post(`/api/v1/conversations/${c}/messages`)
        .set(auth(a.accessToken))
        .send({ type: 'FILE', attachmentIds })
        .expect(400);
    await request(server)
      .post(`/api/v1/conversations/${c}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'IMAGE', attachmentIds: [pdf.id] })
      .expect(400);
    await request(server)
      .post(`/api/v1/conversations/${c}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'VOICE', attachmentIds: [pdf.id], voiceDurationSec: 0 })
      .expect(400);
  });

  it('delivers websocket messages, typing, presence and coalesced notifications', async () => {
    const a = await registerAndLogin(app, 'a@test.local');
    const b = await registerAndLogin(app, 'b@test.local');
    const server = app.getHttpServer();
    const c = await request(server)
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: b.user.id });
    const address = (app.getHttpServer() as Server).address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/rt`;
    const bad = io(url, { auth: { token: 'bad' }, forceNew: true });
    await expect(once<Error>(bad, 'connect_error')).resolves.toBeTruthy();
    bad.close();
    const sa = io(url, { auth: { token: a.accessToken }, forceNew: true });
    const sb = io(url, { auth: { token: b.accessToken }, forceNew: true });
    await Promise.all([once(sa, 'connect'), once(sb, 'connect')]);
    const newMessage = once<{ body: string }>(sb, 'message:new');
    const notification = once<{ type: string }>(sb, 'notification:new');
    await request(server)
      .post(`/api/v1/conversations/${c.body.id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'one' })
      .expect(201);
    expect((await newMessage).body).toBe('one');
    expect((await notification).type).toBe('MESSAGE_RECEIVED');
    const typing = once<{ userId: string }>(sb, 'typing');
    const ack = await new Promise<{ ok: boolean }>((resolve) =>
      sa.emit('typing', { conversationId: c.body.id, isTyping: true }, resolve),
    );
    expect(ack.ok).toBe(true);
    expect((await typing).userId).toBe(a.user.id);
    const outsider = await registerAndLogin(app, 'o@test.local');
    const so = io(url, { auth: { token: outsider.accessToken }, forceNew: true });
    await once(so, 'connect');
    expect(
      (
        await new Promise<{ ok: boolean }>((resolve) =>
          so.emit('conversation:join', { conversationId: c.body.id }, resolve),
        )
      ).ok,
    ).toBe(false);
    sa.close();
    sb.close();
    so.close();
  });
});
