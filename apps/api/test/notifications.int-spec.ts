import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { resetDb } from './helpers/db.js';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
describe('notifications', () => {
  let app: INestApplication;
  beforeEach(async () => {
    await resetDb();
    if (!app) app = await createTestApp();
  });
  afterAll(async () => app?.close());
  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/notifications').expect(401);
  });
  it('marks all notifications read', async () => {
    const a = await registerAndLogin(app, 'note-a@test.local');
    const b = await registerAndLogin(app, 'note-b@test.local');
    const server = app.getHttpServer();
    const c = await request(server)
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: b.user.id });
    await request(server)
      .post(`/api/v1/conversations/${c.body.id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'hello' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await request(server)
      .post('/api/v1/notifications/read-all')
      .set(auth(b.accessToken))
      .send({})
      .expect(201);
    expect(
      (await request(server).get('/api/v1/notifications/unread-count').set(auth(b.accessToken)))
        .body.count,
    ).toBe(0);
  });
});
