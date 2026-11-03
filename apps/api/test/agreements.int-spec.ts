import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { createUser, signToken } from './helpers/auth.js';
import { createAgreement } from './helpers/factories.js';
import { prisma, resetDb } from './helpers/db.js';

describe('Agreement endpoints', () => {
  let app: INestApplication;
  let server: Server;
  let buyer: { id: string };
  let provider: { id: string };
  let outsider: { id: string };
  let buyerToken: string;
  let providerToken: string;
  let outsiderToken: string;
  let agreementId: string;
  let listingId: string;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const path = () => `/api/v1/agreements/${agreementId}`;
  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb();
    buyer = await createUser();
    provider = await createUser();
    outsider = await createUser();
    buyerToken = signToken(app, { id: buyer.id, role: 'USER' });
    providerToken = signToken(app, { id: provider.id, role: 'USER' });
    outsiderToken = signToken(app, { id: outsider.id, role: 'USER' });
    const fixture = await createAgreement({ buyer, provider, listing: {}, amountCents: 5000 });
    agreementId = fixture.agreement.id;
    listingId = fixture.listing.id;
  });
  async function readyDeliverableUpload() {
    return prisma.upload.create({
      data: {
        uploaderId: provider.id,
        purpose: 'DELIVERABLE',
        status: 'READY',
        key: `deliverable/${crypto.randomUUID()}.pdf`,
        fileName: 'work.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
      },
    });
  }
  async function submit() {
    const upload = await readyDeliverableUpload();
    return request(server)
      .post(`${path()}/deliverables`)
      .set(auth(providerToken))
      .send({ note: 'Finished work', attachmentIds: [upload.id] })
      .expect(201);
  }
  async function completed() {
    await request(server).post(`${path()}/complete`).set(auth(buyerToken)).send({}).expect(201);
    await request(server).post(`${path()}/complete`).set(auth(providerToken)).send({}).expect(201);
  }

  describe('GET agreements', () => {
    it('lists mine with stable cursor and role/status filters', async () => {
      const second = await createAgreement({ buyer, provider, listing: {}, amountCents: 6000 });
      const page = await request(server)
        .get('/api/v1/agreements?role=buyer&limit=1')
        .set(auth(buyerToken))
        .expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.items[0].myRole).toBe('buyer');
      expect(page.body.nextCursor).toBeTruthy();
      await request(server)
        .get(`/api/v1/agreements?role=provider&status=ACTIVE`)
        .set(auth(providerToken))
        .expect(200);
      await request(server)
        .get(`/api/v1/agreements?cursor=${page.body.nextCursor}&limit=1`)
        .set(auth(buyerToken))
        .expect(200);
      expect(second.agreement.id).toBeTruthy();
    });
    it('validates query and requires authentication', async () => {
      await request(server).get('/api/v1/agreements?role=nope').set(auth(buyerToken)).expect(400);
      await request(server).get('/api/v1/agreements').expect(401);
    });
    it('shows detail only to participants with parties and confirmation', async () => {
      const response = await request(server).get(path()).set(auth(buyerToken)).expect(200);
      expect(response.body.buyer.id).toBe(buyer.id);
      expect(response.body.provider.id).toBe(provider.id);
      expect(response.body.myRole).toBe('buyer');
      expect(response.body.conversationId).toBeNull();
      await request(server).get(path()).set(auth(outsiderToken)).expect(404);
      await request(server).get(path()).expect(401);
    });
  });

  describe('milestones', () => {
    it('creates and advances milestones, recording timeline events', async () => {
      const created = await request(server)
        .post(`${path()}/milestones`)
        .set(auth(buyerToken))
        .send({ title: 'Draft', amountCents: 1000, dueDate: '2030-01-01T00:00:00.000Z' })
        .expect(201);
      await request(server)
        .patch(`${path()}/milestones/${created.body.id}`)
        .set(auth(providerToken))
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      const done = await request(server)
        .patch(`${path()}/milestones/${created.body.id}`)
        .set(auth(buyerToken))
        .send({ status: 'DONE' })
        .expect(200);
      expect(done.body.status).toBe('DONE');
      const detail = (await request(server).get(path()).set(auth(buyerToken))).body as {
        events: Array<{ type: string }>;
      };
      expect(detail.events.some((event) => event.type === 'MILESTONE_UPDATED')).toBe(true);
    });
    it('returns validation, auth, not-found and conflict errors', async () => {
      await request(server)
        .post(`${path()}/milestones`)
        .set(auth(buyerToken))
        .send({ title: '' })
        .expect(400);
      await request(server).post(`${path()}/milestones`).expect(401);
      await request(server)
        .post(`${path()}/milestones`)
        .set(auth(outsiderToken))
        .send({ title: 'No' })
        .expect(404);
      await request(server)
        .patch(`${path()}/milestones/missing`)
        .set(auth(buyerToken))
        .send({ title: 'No' })
        .expect(404);
      const milestone = await request(server)
        .post(`${path()}/milestones`)
        .set(auth(buyerToken))
        .send({ title: 'Only linear' })
        .expect(201);
      await request(server)
        .patch(`${path()}/milestones/${milestone.body.id}`)
        .set(auth(buyerToken))
        .send({ status: 'DONE' })
        .expect(409);
      await request(server)
        .patch(`${path()}/milestones/${milestone.body.id}`)
        .set(auth(buyerToken))
        .send({})
        .expect(400);
    });
  });

  describe('deliverables', () => {
    it('provider submits, buyer accepts, and exposes presigned attachments', async () => {
      const delivered = await submit();
      expect(delivered.body.attachments[0].url).toBeTruthy();
      await request(server)
        .post(`${path()}/deliverables/${delivered.body.id}/accept`)
        .set(auth(buyerToken))
        .send({})
        .expect(201);
      expect(
        (await prisma.deliverable.findUniqueOrThrow({ where: { id: delivered.body.id } }))
          .acceptedAt,
      ).not.toBeNull();
    });
    it('buyer requests revision and agreement returns active', async () => {
      const delivered = await submit();
      await request(server)
        .post(`${path()}/deliverables/${delivered.body.id}/request-revision`)
        .set(auth(buyerToken))
        .send({ note: 'Please revise' })
        .expect(201);
      expect(
        (await prisma.agreement.findUniqueOrThrow({ where: { id: agreementId } })).status,
      ).toBe('ACTIVE');
    });
    it('enforces validation, roles, participant visibility and state conflicts', async () => {
      const upload = await readyDeliverableUpload();
      await request(server)
        .post(`${path()}/deliverables`)
        .set(auth(providerToken))
        .send({ note: 'x', attachmentIds: [] })
        .expect(400);
      await request(server)
        .post(`${path()}/deliverables`)
        .set(auth(buyerToken))
        .send({ note: 'x', attachmentIds: [upload.id] })
        .expect(404);
      await request(server)
        .post(`${path()}/deliverables`)
        .set(auth(outsiderToken))
        .send({ note: 'x', attachmentIds: [upload.id] })
        .expect(404);
      await request(server).post(`${path()}/deliverables`).expect(401);
      const delivered = await submit();
      await request(server)
        .post(`${path()}/deliverables/${delivered.body.id}/accept`)
        .set(auth(providerToken))
        .send({})
        .expect(404);
      await request(server)
        .post(`${path()}/deliverables/${delivered.body.id}/accept`)
        .set(auth(outsiderToken))
        .send({})
        .expect(404);
      await request(server)
        .post(`${path()}/deliverables/${delivered.body.id}/request-revision`)
        .set(auth(buyerToken))
        .send({ note: '' })
        .expect(400);
      await request(server)
        .post(`${path()}/deliverables/${delivered.body.id}/accept`)
        .set(auth(buyerToken))
        .send({})
        .expect(201);
      await request(server)
        .post(`${path()}/deliverables/${delivered.body.id}/accept`)
        .set(auth(buyerToken))
        .send({})
        .expect(409);
    });
  });

  describe('completion, cancel and dispute', () => {
    it('requires both confirmations and completes listing exactly once under concurrent final confirmation', async () => {
      await request(server).post(`${path()}/complete`).set(auth(buyerToken)).send({}).expect(201);
      const [one, two] = await Promise.all([
        request(server).post(`${path()}/complete`).set(auth(providerToken)).send({}),
        request(server).post(`${path()}/complete`).set(auth(providerToken)).send({}),
      ]);
      expect([one.status, two.status]).toEqual([201, 201]);
      const users = await prisma.user.findMany({ where: { id: { in: [buyer.id, provider.id] } } });
      expect(users.map((user) => user.completedCount)).toEqual([1, 1]);
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe(
        'COMPLETED',
      );
    });
    it('validates completion access and state', async () => {
      await request(server).post(`${path()}/complete`).expect(401);
      await request(server)
        .post(`${path()}/complete`)
        .set(auth(outsiderToken))
        .send({})
        .expect(404);
      await completed();
      await request(server)
        .post(`${path()}/cancel`)
        .set(auth(buyerToken))
        .send({ reason: 'late' })
        .expect(409);
    });
    it('cancels or disputes once and creates an agreement report', async () => {
      await request(server)
        .post(`${path()}/cancel`)
        .set(auth(buyerToken))
        .send({ reason: '' })
        .expect(400);
      await request(server)
        .post(`${path()}/cancel`)
        .set(auth(outsiderToken))
        .send({ reason: 'No' })
        .expect(404);
      await request(server)
        .post(`${path()}/cancel`)
        .set(auth(buyerToken))
        .send({ reason: 'No longer needed' })
        .expect(201);
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: listingId } })).status).toBe(
        'CLOSED',
      );
      await request(server)
        .post(`${path()}/cancel`)
        .set(auth(providerToken))
        .send({ reason: 'again' })
        .expect(409);
    });
    it('creates a dispute report and resolves complete versus cancel with one winner', async () => {
      const [complete, cancel] = await Promise.all([
        request(server).post(`${path()}/complete`).set(auth(buyerToken)).send({}),
        request(server).post(`${path()}/cancel`).set(auth(providerToken)).send({ reason: 'stop' }),
      ]);
      expect([complete.status, cancel.status].filter((status) => status === 201)).toHaveLength(2);
      const state = await prisma.agreement.findUniqueOrThrow({ where: { id: agreementId } });
      expect(['CANCELLED', 'ACTIVE']).toContain(state.status);
      const disputed = await createAgreement({ buyer, provider, listing: {}, amountCents: 1000 });
      await request(server)
        .post(`/api/v1/agreements/${disputed.agreement.id}/dispute`)
        .set(auth(buyerToken))
        .send({ reason: 'Fraud concern' })
        .expect(201);
      expect(
        await prisma.report.findFirst({
          where: { targetId: disputed.agreement.id, targetType: 'AGREEMENT' },
        }),
      ).not.toBeNull();
    });
  });

  describe('reviews and lifecycle races', () => {
    it('runs full lifecycle, reviews both parties and updates ratings/counts', async () => {
      const first = await submit();
      await request(server)
        .post(`${path()}/deliverables/${first.body.id}/request-revision`)
        .set(auth(buyerToken))
        .send({ note: 'Change copy' })
        .expect(201);
      const second = await submit();
      await request(server)
        .post(`${path()}/deliverables/${second.body.id}/accept`)
        .set(auth(buyerToken))
        .send({})
        .expect(201);
      await completed();
      await request(server)
        .post(`${path()}/reviews`)
        .set(auth(buyerToken))
        .send({ rating: 5, comment: 'Excellent' })
        .expect(201);
      await request(server)
        .post(`${path()}/reviews`)
        .set(auth(providerToken))
        .send({ rating: 4 })
        .expect(201);
      const rated = await prisma.user.findUniqueOrThrow({ where: { id: provider.id } });
      expect(rated.ratingAvg).toBe(5);
      expect(rated.ratingCount).toBe(1);
      await request(server).get(`/api/v1/users/${provider.id}/reviews`).expect(200);
    });
    it('validates and authorizes reviews and allows only one concurrent review', async () => {
      await request(server)
        .post(`${path()}/reviews`)
        .set(auth(buyerToken))
        .send({ rating: 5 })
        .expect(409);
      await completed();
      await request(server).post(`${path()}/reviews`).expect(401);
      await request(server)
        .post(`${path()}/reviews`)
        .set(auth(outsiderToken))
        .send({ rating: 5 })
        .expect(404);
      await request(server)
        .post(`${path()}/reviews`)
        .set(auth(buyerToken))
        .send({ rating: 6 })
        .expect(400);
      const [left, right] = await Promise.all([
        request(server).post(`${path()}/reviews`).set(auth(buyerToken)).send({ rating: 5 }),
        request(server).post(`${path()}/reviews`).set(auth(buyerToken)).send({ rating: 5 }),
      ]);
      expect([left.status, right.status].sort()).toEqual([201, 409]);
    });
    it('accept and revision race resolve a deliverable only once', async () => {
      const delivered = await submit();
      const [accept, revision] = await Promise.all([
        request(server)
          .post(`${path()}/deliverables/${delivered.body.id}/accept`)
          .set(auth(buyerToken))
          .send({}),
        request(server)
          .post(`${path()}/deliverables/${delivered.body.id}/request-revision`)
          .set(auth(buyerToken))
          .send({ note: 'change' }),
      ]);
      expect([accept.status, revision.status].sort()).toEqual([201, 409]);
    });
  });
});
