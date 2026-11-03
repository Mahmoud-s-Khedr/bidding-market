import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { registerAndLogin } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';
import { ListingKind } from '../src/generated/prisma/client.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
describe('conversations', () => {
  let app: INestApplication;
  beforeEach(async () => {
    await resetDb();
    if (!app) app = await createTestApp();
  });
  afterAll(async () => app?.close());
  const create = async (token: string, recipientId: string, extra: object = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set(auth(token))
      .send({ recipientId, ...extra });

  it('requires authentication to list conversations', async () => {
    await request(app.getHttpServer()).get('/api/v1/conversations').expect(401);
  });
  it('requires authentication to create a conversation', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .send({ recipientId: 'x' })
      .expect(401);
  });
  it('requires authentication to get conversation detail', async () => {
    await request(app.getHttpServer()).get('/api/v1/conversations/x').expect(401);
  });
  it('rejects messaging yourself', async () => {
    const a = await registerAndLogin(app, 'self@test.local');
    expect((await create(a.accessToken, a.user.id)).status).toBe(400);
  });
  it('returns 404 for a missing recipient', async () => {
    const a = await registerAndLogin(app, 'missing@test.local');
    expect((await create(a.accessToken, 'missing')).status).toBe(404);
  });
  it('returns 404 for a banned recipient', async () => {
    const a = await registerAndLogin(app, 'active@test.local');
    const b = await registerAndLogin(app, 'banned@test.local');
    await prisma.user.update({ where: { id: b.user.id }, data: { status: 'BANNED' } });
    expect((await create(a.accessToken, b.user.id)).status).toBe(404);
  });
  it('deduplicates concurrent direct conversations', async () => {
    const a = await registerAndLogin(app, 'dedup-a@test.local');
    const b = await registerAndLogin(app, 'dedup-b@test.local');
    const [one, two] = await Promise.all([
      create(a.accessToken, b.user.id),
      create(a.accessToken, b.user.id),
    ]);
    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    expect(one.body.id).toBe(two.body.id);
  });
  it('deduplicates conversations for the same listing only', async () => {
    const a = await registerAndLogin(app, 'listing-a@test.local');
    const b = await registerAndLogin(app, 'listing-b@test.local');
    const category = await prisma.category.create({ data: { name: 'Cat', slug: 'cat' } });
    const listing = (n: string) =>
      prisma.listing.create({
        data: {
          ownerId: a.user.id,
          categoryId: category.id,
          kind: ListingKind.OFFER,
          title: n,
          description: n,
          priceType: 'FIXED',
          priceMinCents: 100,
        },
      });
    const l1 = await listing('one');
    const l2 = await listing('two');
    const first = await create(a.accessToken, b.user.id, { listingId: l1.id });
    const same = await create(a.accessToken, b.user.id, { listingId: l1.id });
    const distinct = await create(a.accessToken, b.user.id, { listingId: l2.id });
    expect(same.body.id).toBe(first.body.id);
    expect(distinct.body.id).not.toBe(first.body.id);
  });
  it('hides a conversation from a non-participant', async () => {
    const a = await registerAndLogin(app, 'owner@test.local');
    const b = await registerAndLogin(app, 'peer@test.local');
    const o = await registerAndLogin(app, 'outsider@test.local');
    const c = await create(a.accessToken, b.user.id);
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${c.body.id}`)
      .set(auth(o.accessToken))
      .expect(404);
  });
  it('paginates empty and active conversations without skipping ties', async () => {
    const a = await registerAndLogin(app, 'page-a@test.local');
    const peers = await Promise.all(
      ['b', 'c', 'd'].map((x) => registerAndLogin(app, `page-${x}@test.local`)),
    );
    const conversations = await Promise.all(peers.map((p) => create(a.accessToken, p.user.id)));
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversations[0]!.body.id}/messages`)
      .set(auth(a.accessToken))
      .send({ type: 'TEXT', body: 'active' })
      .expect(201);
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 3; i++) {
      const page = await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .query({ limit: 1, cursor })
        .set(auth(a.accessToken))
        .expect(200);
      ids.push(page.body.items[0].id);
      cursor = page.body.nextCursor ?? undefined;
    }
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain(conversations[0]!.body.id);
  });
  it('rejects an invalid conversation cursor', async () => {
    const a = await registerAndLogin(app, 'cursor@test.local');
    await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .query({ cursor: 'not-base64' })
      .set(auth(a.accessToken))
      .expect(400);
  });
});
