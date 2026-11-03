import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { createAdmin, createUser, loginAs, signToken } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';

describe('reports and admin API', () => {
  let app: INestApplication;
  let server: Server;
  let adminToken: string;
  let userToken: string;
  let adminId: string;
  let userId: string;
  let listingId: string;
  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => app?.close());
  beforeEach(async () => {
    await resetDb();
    const admin = await createAdmin('admin@test.local');
    const user = await createUser({ email: 'user@test.local' });
    adminId = admin.id;
    userId = user.id;
    adminToken = signToken(app, { id: admin.id, role: 'ADMIN' });
    userToken = signToken(app, { id: user.id, role: 'USER' });
    const category = await prisma.category.create({
      data: { name: 'Test', slug: `test-${crypto.randomUUID()}` },
    });
    const listing = await prisma.listing.create({
      data: {
        ownerId: admin.id,
        categoryId: category.id,
        kind: 'REQUEST',
        status: 'OPEN',
        title: 'Moderated listing',
        description: 'A description sufficiently long for moderation tests',
        priceType: 'FIXED',
        priceMinCents: 100,
      },
    });
    listingId = listing.id;
  });
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('requires authentication for reports and every admin endpoint', async () => {
    await request(server)
      .post('/api/v1/reports')
      .send({ targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })
      .expect(401);
    for (const path of ['/stats', '/users', '/listings', '/reports', '/audit-log'])
      await request(server).get(`/api/v1/admin${path}`).expect(401);
  });
  it('forbids non-admin admin reads and writes', async () => {
    await request(server).get('/api/v1/admin/stats').set(auth(userToken)).expect(403);
    await request(server)
      .patch(`/api/v1/admin/users/${adminId}`)
      .set(auth(userToken))
      .send({ status: 'SUSPENDED' })
      .expect(403);
    await request(server)
      .post(`/api/v1/admin/listings/${listingId}/remove`)
      .set(auth(userToken))
      .send({ reason: 'spam' })
      .expect(403);
  });
  it('validates report and admin write bodies', async () => {
    await request(server).post('/api/v1/reports').set(auth(userToken)).send({}).expect(400);
    await request(server)
      .patch(`/api/v1/admin/users/${userId}`)
      .set(auth(adminToken))
      .send({ status: 'NOPE' })
      .expect(400);
    await request(server)
      .post(`/api/v1/admin/listings/${listingId}/remove`)
      .set(auth(adminToken))
      .send({})
      .expect(400);
    await request(server)
      .post('/api/v1/admin/reports/missing/resolve')
      .set(auth(adminToken))
      .send({ action: 'NOPE' })
      .expect(400);
  });
  it('rejects unknown report targets, self reports, and duplicate open reports', async () => {
    await request(server)
      .post('/api/v1/reports')
      .set(auth(userToken))
      .send({ targetType: 'LISTING', targetId: 'missing', reason: 'SPAM' })
      .expect(404);
    await request(server)
      .post('/api/v1/reports')
      .set(auth(userToken))
      .send({ targetType: 'USER', targetId: userId, reason: 'SPAM' })
      .expect(400);
    await request(server)
      .post('/api/v1/reports')
      .set(auth(userToken))
      .send({ targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })
      .expect(201);
    await request(server)
      .post('/api/v1/reports')
      .set(auth(userToken))
      .send({ targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })
      .expect(409);
  });
  it('hides messages outside the reporter conversation', async () => {
    const other = await createUser();
    const conversation = await prisma.conversation.create({
      data: { participants: { create: [{ userId: adminId }, { userId: other.id }] } },
    });
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, senderId: other.id, type: 'TEXT', body: 'private' },
    });
    await request(server)
      .post('/api/v1/reports')
      .set(auth(userToken))
      .send({ targetType: 'MESSAGE', targetId: message.id, reason: 'HARASSMENT' })
      .expect(404);
  });
  it('removes a listing, declines active bids, restores prior status, and audits both writes', async () => {
    const bid = await prisma.bid.create({
      data: {
        listingId,
        bidderId: userId,
        amountCents: 10,
        currency: 'USD',
        deliveryDays: 1,
        message: 'bid',
        status: 'PENDING',
      },
    });
    await request(server)
      .post(`/api/v1/admin/listings/${listingId}/remove`)
      .set(auth(adminToken))
      .send({ reason: 'policy' })
      .expect(201);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe(
      'REMOVED',
    );
    expect((await prisma.bid.findUniqueOrThrow({ where: { id: bid.id } })).status).toBe('DECLINED');
    await request(server).get(`/api/v1/listings/${listingId}`).expect(404);
    await request(server)
      .post(`/api/v1/admin/listings/${listingId}/restore`)
      .set(auth(adminToken))
      .send({ reason: 'appeal' })
      .expect(201);
    expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe(
      'OPEN',
    );
    const logs = await prisma.auditLog.findMany({
      where: { actorId: adminId, targetId: listingId },
    });
    expect(logs.map((x) => x.action).sort()).toEqual(['LISTING_REMOVED', 'LISTING_RESTORED']);
  });
  it('rejects restoring a listing that is not removed', async () => {
    await request(server)
      .post(`/api/v1/admin/listings/${listingId}/restore`)
      .set(auth(adminToken))
      .send({ reason: 'nope' })
      .expect(409);
  });
  it('enforces last-admin and self-modification guards', async () => {
    await request(server)
      .patch(`/api/v1/admin/users/${adminId}`)
      .set(auth(adminToken))
      .send({ role: 'USER' })
      .expect(400);
    const second = await createAdmin();
    await request(server)
      .patch(`/api/v1/admin/users/${second.id}`)
      .set(auth(adminToken))
      .send({ role: 'USER' })
      .expect(200);
    await request(server)
      .patch(`/api/v1/admin/users/${adminId}`)
      .set(auth(adminToken))
      .send({ role: 'USER' })
      .expect(400);
  });
  it('suspends a user, revokes refresh credentials, blocks access, and audits', async () => {
    const login = await loginAs(app, 'user@test.local');
    await request(server)
      .patch(`/api/v1/admin/users/${userId}`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED', reason: 'policy' })
      .expect(200);
    await request(server).post('/api/v1/auth/refresh').set('Cookie', login.cookie).expect(401);
    await request(server).get('/api/v1/auth/me').set(auth(login.accessToken)).expect(403);
    expect(
      await prisma.auditLog.count({
        where: { actorId: adminId, targetId: userId, action: 'USER_UPDATED' },
      }),
    ).toBe(1);
  });
  it('resolves a report once, auto-resolves duplicates, and audits concurrent resolution', async () => {
    const report = await prisma.report.create({
      data: { reporterId: userId, targetType: 'LISTING', targetId: listingId, reason: 'SPAM' },
    });
    const responses = await Promise.all([
      request(server)
        .post(`/api/v1/admin/reports/${report.id}/resolve`)
        .set(auth(adminToken))
        .send({ action: 'DISMISS', note: 'ok' }),
      request(server)
        .post(`/api/v1/admin/reports/${report.id}/resolve`)
        .set(auth(adminToken))
        .send({ action: 'DISMISS', note: 'ok' }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.auditLog.count({
        where: { actorId: adminId, targetId: report.id, action: 'REPORT_RESOLVED' },
      }),
    ).toBe(1);
  });
  it('returns zero-filled stats and paginated admin resources', async () => {
    const stats = await request(server)
      .get('/api/v1/admin/stats')
      .set(auth(adminToken))
      .expect(200);
    expect(stats.body.daily).toHaveLength(30);
    expect(stats.body.users.ACTIVE).toBe(2);
    expect(stats.body.listings.OPEN).toBe(1);
    const daily = stats.body.daily as Array<{ signups: number }>;
    expect(daily.every((d) => typeof d.signups === 'number')).toBe(true);
    await request(server).get('/api/v1/admin/users?limit=1').set(auth(adminToken)).expect(200);
    await request(server).get('/api/v1/admin/listings?limit=1').set(auth(adminToken)).expect(200);
    await request(server).get('/api/v1/admin/reports?limit=1').set(auth(adminToken)).expect(200);
    await request(server).get('/api/v1/admin/audit-log?limit=1').set(auth(adminToken)).expect(200);
  });
});
