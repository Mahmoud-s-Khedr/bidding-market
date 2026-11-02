import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { resetDb, prisma } from './helpers/db.js';
import { registerAndLogin, createUser, assertNoPasswordHash } from './helpers/auth.js';
import { createReview } from './helpers/factories.js';

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
    assertNoPasswordHash(profile.body);
    expect(profile.body).not.toHaveProperty('email');
    expect(profile.body.email).toBeUndefined();
    expect(profile.body).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer()).get('/api/v1/users/missing').expect(404);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .send({ displayName: 'Changed' })
      .expect(401);
    const updated = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth.accessToken}`)
      .send({ displayName: 'Changed' })
      .expect(200);
    assertNoPasswordHash(updated.body);
    expect(updated.body).not.toHaveProperty('email');
    expect(updated.body.displayName).toBe('Changed');

    const reviews = await request(app.getHttpServer())
      .get(`/api/v1/users/${auth.user.id}/reviews`)
      .expect(200);
    assertNoPasswordHash(reviews.body);
    expect(reviews.body).toEqual({ items: [], nextCursor: null });
  });

  it('paginates 3 reviews with limit=1 returning distinct reviews in order and ending with null cursor', async () => {
    const target = await registerAndLogin(app, 'target@market.test');
    const reviewer = await createUser({ email: 'reviewer@market.test' });

    const review1 = await createReview(target.user.id, reviewer.id, {
      rating: 5,
      comment: 'First newest review',
      createdAt: new Date('2026-03-01T12:00:00.000Z'),
    });
    const review2 = await createReview(target.user.id, reviewer.id, {
      rating: 4,
      comment: 'Second review',
      createdAt: new Date('2026-02-01T12:00:00.000Z'),
    });
    const review3 = await createReview(target.user.id, reviewer.id, {
      rating: 3,
      comment: 'Third oldest review',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    });

    // Page 1: returns review1, nextCursor is review1.id
    const page1 = await request(app.getHttpServer())
      .get(`/api/v1/users/${target.user.id}/reviews?limit=1`)
      .expect(200);
    assertNoPasswordHash(page1.body);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.items[0].id).toBe(review1.id);
    expect(page1.body.nextCursor).toBe(review1.id);

    // Page 2: returns review2, nextCursor is review2.id
    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/users/${target.user.id}/reviews?limit=1&cursor=${page1.body.nextCursor}`)
      .expect(200);
    assertNoPasswordHash(page2.body);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).toBe(review2.id);
    expect(page2.body.nextCursor).toBe(review2.id);

    // Page 3: returns review3, nextCursor is null
    const page3 = await request(app.getHttpServer())
      .get(`/api/v1/users/${target.user.id}/reviews?limit=1&cursor=${page2.body.nextCursor}`)
      .expect(200);
    assertNoPasswordHash(page3.body);
    expect(page3.body.items).toHaveLength(1);
    expect(page3.body.items[0].id).toBe(review3.id);
    expect(page3.body.nextCursor).toBeNull();

    // Verify all 3 returned reviews are distinct and in order
    const allReturnedIds = [page1.body.items[0].id, page2.body.items[0].id, page3.body.items[0].id];
    expect(new Set(allReturnedIds).size).toBe(3);
    expect(allReturnedIds).toEqual([review1.id, review2.id, review3.id]);
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
