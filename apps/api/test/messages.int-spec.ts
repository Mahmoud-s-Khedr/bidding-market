import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { resetDb } from './helpers/db.js';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
describe('messages', () => {
  let app: INestApplication;
  beforeEach(async () => {
    await resetDb();
    if (!app) app = await createTestApp();
  });
  afterAll(async () => app?.close());
  it('rejects a text message without a body', async () => {
    const a = await registerAndLogin(app, 'msg-a@test.local');
    const b = await registerAndLogin(app, 'msg-b@test.local');
    const c = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: b.user.id });
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${c.body.id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT' })
      .expect(400);
  });
  it('marks unread messages read', async () => {
    const a = await registerAndLogin(app, 'msg-read-a@test.local');
    const b = await registerAndLogin(app, 'msg-read-b@test.local');
    const server = app.getHttpServer();
    const c = await request(server)
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: b.user.id });
    const m = await request(server)
      .post(`/api/v1/conversations/${c.body.id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'hello' });
    await request(server)
      .post(`/api/v1/conversations/${c.body.id}/read`)
      .set(auth(b.accessToken))
      .send({ lastMessageId: m.body.id })
      .expect(201);
    expect(
      (await request(server).get('/api/v1/conversations').set(auth(b.accessToken))).body.items[0]
        .unreadCount,
    ).toBe(0);
  });
});
