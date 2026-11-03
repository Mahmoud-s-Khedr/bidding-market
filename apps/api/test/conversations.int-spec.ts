import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers/app.js';
import { createUser, registerAndLogin, signToken } from './helpers/auth.js';
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
  const userWithToken = async (email?: string, role: 'USER' | 'ADMIN' = 'USER') => {
    const user = await createUser({ email, role });
    return { user, accessToken: signToken(app, user) };
  };

  it('returns 404 when linking a DRAFT listing from a non-owner', async () => {
    const owner = await userWithToken('owner-draft@test.local');
    const nonOwner = await userWithToken('nonowner-draft@test.local');
    const category = await prisma.category.create({
      data: { name: 'CatDraft', slug: 'cat-draft' },
    });
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.user.id,
        categoryId: category.id,
        kind: ListingKind.OFFER,
        title: 'Draft item',
        description: 'Draft item',
        priceType: 'FIXED',
        priceMinCents: 100,
        status: 'DRAFT',
      },
    });
    const res = await create(nonOwner.accessToken, owner.user.id, { listingId: listing.id });
    expect(res.status).toBe(404);
  });
  it('returns 404 when linking a REMOVED listing from a non-owner', async () => {
    const owner = await userWithToken('owner-removed@test.local');
    const nonOwner = await userWithToken('nonowner-removed@test.local');
    const category = await prisma.category.create({
      data: { name: 'CatRemoved', slug: 'cat-removed' },
    });
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.user.id,
        categoryId: category.id,
        kind: ListingKind.OFFER,
        title: 'Removed item',
        description: 'Removed item',
        priceType: 'FIXED',
        priceMinCents: 100,
        status: 'REMOVED',
      },
    });
    const res = await create(nonOwner.accessToken, owner.user.id, { listingId: listing.id });
    expect(res.status).toBe(404);
  });
  it('returns 404 when linking someone elses bid', async () => {
    const owner = await userWithToken('owner-bid@test.local');
    const bidder = await userWithToken('bidder-bid@test.local');
    const stranger = await userWithToken('stranger-bid@test.local');
    const category = await prisma.category.create({ data: { name: 'CatBid', slug: 'cat-bid' } });
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.user.id,
        categoryId: category.id,
        kind: ListingKind.REQUEST,
        title: 'Need help',
        description: 'Need help',
        priceType: 'FIXED',
        priceMinCents: 100,
        status: 'OPEN',
      },
    });
    const bid = await prisma.bid.create({
      data: {
        listingId: listing.id,
        bidderId: bidder.user.id,
        amountCents: 500,
        currency: 'USD',
        deliveryDays: 3,
        message: 'I can do it',
      },
    });
    const res = await create(stranger.accessToken, owner.user.id, { bidId: bid.id });
    expect(res.status).toBe(404);
  });
  it('returns 404 when recipient is mismatched for a bid', async () => {
    const owner = await userWithToken('owner-mismatch@test.local');
    const bidder = await userWithToken('bidder-mismatch@test.local');
    const thirdParty = await userWithToken('third-mismatch@test.local');
    const category = await prisma.category.create({
      data: { name: 'CatMismatch', slug: 'cat-mismatch' },
    });
    const listing = await prisma.listing.create({
      data: {
        ownerId: owner.user.id,
        categoryId: category.id,
        kind: ListingKind.REQUEST,
        title: 'Need help 2',
        description: 'Need help 2',
        priceType: 'FIXED',
        priceMinCents: 100,
        status: 'OPEN',
      },
    });
    const bid = await prisma.bid.create({
      data: {
        listingId: listing.id,
        bidderId: bidder.user.id,
        amountCents: 500,
        currency: 'USD',
        deliveryDays: 3,
        message: 'I can do it',
      },
    });
    const resBidder = await create(bidder.accessToken, thirdParty.user.id, { bidId: bid.id });
    expect(resBidder.status).toBe(404);

    const resOwner = await create(owner.accessToken, thirdParty.user.id, { bidId: bid.id });
    expect(resOwner.status).toBe(404);
  });
  it('allows happy paths: owner can link DRAFT listing and bidder/owner can link bid', async () => {
    const owner = await userWithToken('owner-happy@test.local');
    const bidder = await userWithToken('bidder-happy@test.local');
    const category = await prisma.category.create({
      data: { name: 'CatHappy', slug: 'cat-happy' },
    });
    const draftListing = await prisma.listing.create({
      data: {
        ownerId: owner.user.id,
        categoryId: category.id,
        kind: ListingKind.OFFER,
        title: 'Draft happy',
        description: 'Draft happy',
        priceType: 'FIXED',
        priceMinCents: 100,
        status: 'DRAFT',
      },
    });
    const resDraft = await create(owner.accessToken, bidder.user.id, {
      listingId: draftListing.id,
    });
    expect(resDraft.status).toBe(201);
    expect(resDraft.body.listingId).toBe(draftListing.id);

    const openListing = await prisma.listing.create({
      data: {
        ownerId: owner.user.id,
        categoryId: category.id,
        kind: ListingKind.REQUEST,
        title: 'Open happy',
        description: 'Open happy',
        priceType: 'FIXED',
        priceMinCents: 100,
        status: 'OPEN',
      },
    });
    const bid = await prisma.bid.create({
      data: {
        listingId: openListing.id,
        bidderId: bidder.user.id,
        amountCents: 500,
        currency: 'USD',
        deliveryDays: 3,
        message: 'I can do it',
      },
    });
    const resBidder = await create(bidder.accessToken, owner.user.id, {
      listingId: openListing.id,
      bidId: bid.id,
    });
    expect(resBidder.status).toBe(201);
    expect(resBidder.body.bidId).toBe(bid.id);
  });
});
