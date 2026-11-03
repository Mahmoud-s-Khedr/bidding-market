import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';
import { UploadPurpose } from '../src/generated/prisma/client.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
describe('messages', () => {
  let app: INestApplication;
  beforeEach(async () => {
    await resetDb();
    await app?.close();
    app = await createTestApp();
  });
  afterAll(async () => app?.close());
  const pair = async () => {
    const a = await registerAndLogin(app, `a-${crypto.randomUUID()}@test.local`);
    const b = await registerAndLogin(app, `b-${crypto.randomUUID()}@test.local`);
    const c = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: b.user.id })
      .expect(201);
    return { a, b, id: c.body.id as string };
  };
  const upload = (
    userId: string,
    mimeType: string,
    purpose: UploadPurpose = UploadPurpose.MESSAGE_ATTACHMENT,
  ) =>
    prisma.upload.create({
      data: {
        uploaderId: userId,
        purpose,
        status: 'READY',
        key: crypto.randomUUID(),
        fileName: 'asset',
        mimeType,
        sizeBytes: 1,
      },
    });
  const send = (token: string, id: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set(auth(token))
      .send(body);

  it('requires authentication to list messages', async () => {
    await request(app.getHttpServer()).get('/api/v1/conversations/x/messages').expect(401);
  });
  it('requires authentication to send a message', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/conversations/x/messages')
      .send({ type: 'TEXT', body: 'x' })
      .expect(401);
  });
  it('requires authentication to mark messages read', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/conversations/x/read')
      .send({ lastMessageId: 'x' })
      .expect(401);
  });
  it('rejects a text message without a body', async () => {
    const { a, id } = await pair();
    await send(a.accessToken, id, { type: 'TEXT' }).expect(400);
  });
  it('rejects text attachments', async () => {
    const { a, id } = await pair();
    const file = await upload(a.user.id, 'application/pdf');
    await send(a.accessToken, id, { type: 'TEXT', body: 'x', attachmentIds: [file.id] }).expect(
      400,
    );
  });
  it('returns 404 to a non-participant', async () => {
    const { id } = await pair();
    const o = await registerAndLogin(app, 'outside-message@test.local');
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}/messages`)
      .set(auth(o.accessToken))
      .expect(404);
  });
  it('counts multiple incoming messages but not own messages as unread', async () => {
    const { a, b, id } = await pair();
    await send(a.accessToken, id, { type: 'TEXT', body: 'one' });
    await send(a.accessToken, id, { type: 'TEXT', body: 'two' });
    await send(b.accessToken, id, { type: 'TEXT', body: 'reply' });
    const row = (
      await request(app.getHttpServer()).get('/api/v1/conversations').set(auth(b.accessToken))
    ).body.items[0];
    expect(row.unreadCount).toBe(2);
  });
  it('does not move a REST read marker backwards', async () => {
    const { a, b, id } = await pair();
    const one = await send(a.accessToken, id, { type: 'TEXT', body: 'one' });
    const two = await send(a.accessToken, id, { type: 'TEXT', body: 'two' });
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/read`)
      .set(auth(b.accessToken))
      .send({ lastMessageId: two.body.id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/read`)
      .set(auth(b.accessToken))
      .send({ lastMessageId: one.body.id })
      .expect(201);
    expect(
      (await request(app.getHttpServer()).get('/api/v1/conversations').set(auth(b.accessToken)))
        .body.items[0].unreadCount,
    ).toBe(0);
  });
  it('keeps the newest marker under concurrent reads', async () => {
    const { a, b, id } = await pair();
    const one = await send(a.accessToken, id, { type: 'TEXT', body: 'one' });
    const two = await send(a.accessToken, id, { type: 'TEXT', body: 'two' });
    await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/conversations/${id}/read`)
        .set(auth(b.accessToken))
        .send({ lastMessageId: one.body.id }),
      request(app.getHttpServer())
        .post(`/api/v1/conversations/${id}/read`)
        .set(auth(b.accessToken))
        .send({ lastMessageId: two.body.id }),
    ]);
    expect(
      (await request(app.getHttpServer()).get('/api/v1/conversations').set(auth(b.accessToken)))
        .body.items[0].unreadCount,
    ).toBe(0);
  });
  it('paginates messages with a stable tie breaker', async () => {
    const { a, b, id } = await pair();
    await Promise.all(
      ['one', 'two', 'three'].map((body) => send(a.accessToken, id, { type: 'TEXT', body })),
    );
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 3; i++) {
      const page = await request(app.getHttpServer())
        .get(`/api/v1/conversations/${id}/messages`)
        .query({ limit: 1, cursor })
        .set(auth(b.accessToken))
        .expect(200);
      ids.push(page.body.items[0].id);
      cursor = page.body.nextCursor ?? undefined;
    }
    expect(new Set(ids).size).toBe(3);
  });
  it('rejects an invalid message cursor', async () => {
    const { a, id } = await pair();
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}/messages`)
      .query({ cursor: 'bad' })
      .set(auth(a.accessToken))
      .expect(400);
  });
  it.each([0, 601, 1.5])('rejects an invalid voice duration of %s', async (voiceDurationSec) => {
    const { a, id } = await pair();
    const audio = await upload(a.user.id, 'audio/ogg');
    await send(a.accessToken, id, {
      type: 'VOICE',
      attachmentIds: [audio.id],
      voiceDurationSec,
    }).expect(400);
  });
  it('rejects a missing voice duration', async () => {
    const { a, id } = await pair();
    const audio = await upload(a.user.id, 'audio/ogg');
    await send(a.accessToken, id, { type: 'VOICE', attachmentIds: [audio.id] }).expect(400);
  });
  it('accepts a 600 second voice message and presigns its attachment', async () => {
    const { a, b, id } = await pair();
    const audio = await upload(a.user.id, 'audio/ogg');
    await send(a.accessToken, id, {
      type: 'VOICE',
      attachmentIds: [audio.id],
      voiceDurationSec: 600,
    }).expect(201);
    const page = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}/messages`)
      .set(auth(b.accessToken));
    expect(page.body.items[0].attachments[0].url).toContain('X-Amz');
  });
  it('accepts image attachments and presigns them on read', async () => {
    const { a, b, id } = await pair();
    const image = await upload(a.user.id, 'image/png');
    await send(a.accessToken, id, { type: 'IMAGE', attachmentIds: [image.id] }).expect(201);
    const page = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}/messages`)
      .set(auth(b.accessToken));
    expect(page.body.items[0].attachments[0].url).toContain('X-Amz');
  });
  it('accepts file attachments and presigns them on read', async () => {
    const { a, b, id } = await pair();
    const file = await upload(a.user.id, 'application/pdf');
    await send(a.accessToken, id, { type: 'FILE', attachmentIds: [file.id] }).expect(201);
    const page = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}/messages`)
      .set(auth(b.accessToken));
    expect(page.body.items[0].attachments[0].url).toContain('X-Amz');
  });
  it('rejects another users upload', async () => {
    const { a, b, id } = await pair();
    const file = await upload(b.user.id, 'application/pdf');
    await send(a.accessToken, id, { type: 'FILE', attachmentIds: [file.id] }).expect(400);
  });
  it('rejects a wrong upload purpose', async () => {
    const { a, id } = await pair();
    const file = await upload(a.user.id, 'application/pdf', UploadPurpose.AVATAR);
    await send(a.accessToken, id, { type: 'FILE', attachmentIds: [file.id] }).expect(400);
  });
  it('rejects an invalid image MIME type', async () => {
    const { a, id } = await pair();
    const file = await upload(a.user.id, 'application/pdf');
    await send(a.accessToken, id, { type: 'IMAGE', attachmentIds: [file.id] }).expect(400);
  });
  it('rejects an invalid voice MIME type', async () => {
    const { a, id } = await pair();
    const file = await upload(a.user.id, 'application/pdf');
    await send(a.accessToken, id, {
      type: 'VOICE',
      attachmentIds: [file.id],
      voiceDurationSec: 1,
    }).expect(400);
  });
  it('rejects reuse of an attached upload', async () => {
    const { a, id } = await pair();
    const file = await upload(a.user.id, 'application/pdf');
    await send(a.accessToken, id, { type: 'FILE', attachmentIds: [file.id] }).expect(201);
    await send(a.accessToken, id, { type: 'FILE', attachmentIds: [file.id] }).expect(400);
  });
});
