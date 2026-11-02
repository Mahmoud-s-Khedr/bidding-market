import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { resetDb, prisma } from './helpers/db.js';
import { registerAndLogin } from './helpers/auth.js';
describe('users', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(resetDb);
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  it('exposes a safe public profile and updates own profile', async () => {
    const auth = await registerAndLogin(app);
    const profile = await request(app.getHttpServer())
      .get(`/api/v1/users/${auth.user.id}`)
      .expect(200);
    expect(profile.body.email).toBeUndefined();
    expect(profile.body.passwordHash).toBeUndefined();
    await request(app.getHttpServer()).get('/api/v1/users/missing').expect(404);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .send({ displayName: 'Changed' })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ displayName: 'Changed' })
      .expect(200);
    const reviews = await request(app.getHttpServer())
      .get(`/api/v1/users/${auth.user.id}/reviews`)
      .expect(200);
    expect(reviews.body).toEqual({ items: [], nextCursor: null });
  });
  it('validates profile updates and review pagination', async () => {
    const auth = await registerAndLogin(app);
    const invalid = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ displayName: 'x'.repeat(81) })
      .expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    await request(app.getHttpServer())
      .get(`/api/v1/users/${auth.user.id}/reviews?limit=51`)
      .expect(400);
    await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
  });
});
