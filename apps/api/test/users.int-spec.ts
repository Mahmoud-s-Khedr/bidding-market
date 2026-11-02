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

  it('validates avatar upload reference on PATCH /users/me and serves presigned avatarUrl', async () => {
    const auth1 = await registerAndLogin(app, 'user1@market.test');
    const auth2 = await registerAndLogin(app, 'user2@market.test');

    // 1. Non-existent avatar upload -> 400
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .send({ avatarUploadId: 'clh0000000000000000000000' })
      .expect(400);

    // 2. Upload with purpose LISTING_IMAGE instead of AVATAR -> 400
    const wrongPurposePresign = await request(app.getHttpServer())
      .post('/api/v1/uploads/presign')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .send({
        purpose: 'LISTING_IMAGE',
        fileName: 'listing.png',
        mimeType: 'image/png',
        sizeBytes: 100,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .send({ avatarUploadId: wrongPurposePresign.body.uploadId })
      .expect(400);

    // 3. Upload owned by another user -> 400
    const otherUserPresign = await request(app.getHttpServer())
      .post('/api/v1/uploads/presign')
      .set('Authorization', `Bearer ${auth2.accessToken}`)
      .send({
        purpose: 'AVATAR',
        fileName: 'other-avatar.png',
        mimeType: 'image/png',
        sizeBytes: 100,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .send({ avatarUploadId: otherUserPresign.body.uploadId })
      .expect(400);

    // 4. PENDING upload owned by user -> 400
    const avatarContent = 'real-user-avatar-png-binary-content-12345';
    const avatarSize = Buffer.byteLength(avatarContent);
    const validPresign = await request(app.getHttpServer())
      .post('/api/v1/uploads/presign')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .send({
        purpose: 'AVATAR',
        fileName: 'my-avatar.png',
        mimeType: 'image/png',
        sizeBytes: avatarSize,
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .send({ avatarUploadId: validPresign.body.uploadId })
      .expect(400);

    // Now upload real bytes to S3 and complete the upload
    const putRes = await fetch(validPresign.body.url, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: avatarContent,
    });
    expect(putRes.ok).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/uploads/${validPresign.body.uploadId}/complete`)
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .expect(201);

    // 5. Successful PATCH /users/me with READY AVATAR upload
    const updated = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .send({ avatarUploadId: validPresign.body.uploadId })
      .expect(200);

    expect(updated.body.avatarUrl).toBeDefined();
    expect(typeof updated.body.avatarUrl).toBe('string');

    // Download avatarUrl directly from S3
    const avatarDownloadRes = await fetch(updated.body.avatarUrl);
    expect(avatarDownloadRes.ok).toBe(true);
    expect(await avatarDownloadRes.text()).toBe(avatarContent);

    // Verify GET /users/:id returns presigned avatarUrl
    const profileRes = await request(app.getHttpServer())
      .get(`/api/v1/users/${auth1.user.id}`)
      .expect(200);
    expect(profileRes.body.avatarUrl).toBeDefined();
    const profileDownloadRes = await fetch(profileRes.body.avatarUrl);
    expect(profileDownloadRes.ok).toBe(true);
    expect(await profileDownloadRes.text()).toBe(avatarContent);

    // Verify GET /auth/me returns presigned avatarUrl
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .expect(200);
    expect(meRes.body.avatarUrl).toBeDefined();
    const meDownloadRes = await fetch(meRes.body.avatarUrl);
    expect(meDownloadRes.ok).toBe(true);
    expect(await meDownloadRes.text()).toBe(avatarContent);

    // 6. Passing avatarUploadId: null clears avatar
    const cleared = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${auth1.accessToken}`)
      .send({ avatarUploadId: null })
      .expect(200);
    expect(cleared.body.avatarUrl).toBeNull();

    const profileCleared = await request(app.getHttpServer())
      .get(`/api/v1/users/${auth1.user.id}`)
      .expect(200);
    expect(profileCleared.body.avatarUrl).toBeNull();
  });
});
