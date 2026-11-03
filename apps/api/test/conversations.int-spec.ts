import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { resetDb } from './helpers/db.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
describe('conversations', () => {
  let app: INestApplication;
  beforeEach(async () => {
    await resetDb();
    if (!app) app = await createTestApp();
  });
  afterAll(async () => app?.close());
  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/v1/conversations').expect(401);
  });
  it('deduplicates concurrent direct conversations', async () => {
    const a = await registerAndLogin(app, 'con-a@test.local');
    const b = await registerAndLogin(app, 'con-b@test.local');
    const [one, two] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/conversations')
        .set(auth(a.accessToken))
        .send({ recipientId: b.user.id }),
      request(app.getHttpServer())
        .post('/api/v1/conversations')
        .set(auth(a.accessToken))
        .send({ recipientId: b.user.id }),
    ]);
    expect(one.body.id).toBe(two.body.id);
  });
  it('returns 404 for a missing recipient', async () => {
    const a = await registerAndLogin(app, 'con-missing@test.local');
    await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(auth(a.accessToken))
      .send({ recipientId: 'missing' })
      .expect(404);
  });
});
