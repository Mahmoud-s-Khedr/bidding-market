import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { encodeBidCursor } from '../src/modules/bids/bid.cursor.js';
import { createTestApp } from './helpers/app.js';
import { createUser, signToken } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';

describe('Bids endpoints', () => {
  let app: INestApplication;
  let server: Server;
  let ownerToken: string;
  let ownerId: string;
  let bidderToken: string;
  let bidderId: string;
  let bidder2Token: string;
  let bidder2Id: string;
  let thirdToken: string;
  let categoryId: string;
  let openListingId: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb();

    const owner = await createUser({ email: 'owner@market.test' });
    const bidder = await createUser({ email: 'bidder1@market.test' });
    const bidder2 = await createUser({ email: 'bidder2@market.test' });
    const third = await createUser({ email: 'third@market.test' });

    ownerId = owner.id;
    bidderId = bidder.id;
    bidder2Id = bidder2.id;

    ownerToken = signToken(app, { id: owner.id, role: 'USER' });
    bidderToken = signToken(app, { id: bidder.id, role: 'USER' });
    bidder2Token = signToken(app, { id: bidder2.id, role: 'USER' });
    thirdToken = signToken(app, { id: third.id, role: 'USER' });

    const cat = await prisma.category.create({
      data: { name: 'Development', slug: 'dev' },
    });
    categoryId = cat.id;

    const listing = await prisma.listing.create({
      data: {
        ownerId,
        categoryId,
        kind: 'REQUEST',
        status: 'OPEN',
        title: 'Need a mobile application',
        description: 'Detailed description of the mobile app requirements',
        priceType: 'FIXED',
        priceMinCents: 50000,
        currency: 'USD',
        deliveryDays: 14,
      },
    });
    openListingId = listing.id;
  });

  describe('POST /api/v1/listings/:id/bids', () => {
    it('returns 401 when unauthenticated', async () => {
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'I can do it' })
        .expect(401);
    });

    it('returns 400 for validation errors', async () => {
      // Missing amount
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ currency: 'USD', deliveryDays: 10, message: 'I can do it' })
        .expect(400);

      // Negative amount
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: -500, currency: 'USD', deliveryDays: 10, message: 'I can do it' })
        .expect(400);

      // Invalid delivery days
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 0, message: 'I can do it' })
        .expect(400);

      // Message too long (> 5000)
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({
          amountCents: 45000,
          currency: 'USD',
          deliveryDays: 10,
          message: 'a'.repeat(5001),
        })
        .expect(400);

      // Invalid attachmentId
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({
          amountCents: 45000,
          currency: 'USD',
          deliveryDays: 10,
          message: 'bid with bad attachment',
          attachmentIds: ['non-existent-upload-id'],
        })
        .expect(400);
    });

    it('returns 404 when listing does not exist', async () => {
      await request(server)
        .post('/api/v1/listings/non-existent-id/bids')
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'I can do it' })
        .expect(404);
    });

    it('returns 409 when bidding on own listing', async () => {
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Own bid' })
        .expect(409);
    });

    it('returns 409 when listing is closed or expired', async () => {
      const closedListing = await prisma.listing.create({
        data: {
          ownerId,
          categoryId,
          kind: 'REQUEST',
          status: 'CLOSED',
          title: 'Closed listing',
          description: 'A closed listing description',
          priceType: 'FIXED',
          priceMinCents: 1000,
        },
      });

      await request(server)
        .post(`/api/v1/listings/${closedListing.id}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(409);

      const expiredListing = await prisma.listing.create({
        data: {
          ownerId,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Expired listing',
          description: 'An expired listing description',
          priceType: 'FIXED',
          priceMinCents: 1000,
          expiresAt: new Date(Date.now() - 10000),
        },
      });

      await request(server)
        .post(`/api/v1/listings/${expiredListing.id}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(409);
    });

    it('creates bid with READY attachment, initial revision, and returns 201', async () => {
      const upload = await prisma.upload.create({
        data: {
          uploaderId: bidderId,
          purpose: 'BID_ATTACHMENT',
          status: 'READY',
          key: `bid-att-${Date.now()}.pdf`,
          fileName: 'proposal.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        },
      });

      const res = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({
          amountCents: 45000,
          currency: 'USD',
          deliveryDays: 10,
          message: 'My complete proposal is attached.',
          attachmentIds: [upload.id],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.listingId).toBe(openListingId);
      expect(res.body.amountCents).toBe(45000);
      expect(res.body.currency).toBe('USD');
      expect(res.body.deliveryDays).toBe(10);
      expect(res.body.status).toBe('PENDING');
      expect(res.body.bidder.id).toBe(bidderId);
      expect(res.body.attachments).toHaveLength(1);
      expect(res.body.attachments[0].id).toBe(upload.id);
      expect(res.body.revisions).toHaveLength(1);
      expect(res.body.revisions[0].amountCents).toBe(45000);
      expect(res.body.revisions[0].author.id).toBe(bidderId);

      // Verify in DB
      const bidInDb = await prisma.bid.findUnique({
        where: { id: res.body.id },
        include: { revisions: true, attachments: true },
      });
      expect(bidInDb?.status).toBe('PENDING');
      expect(bidInDb?.revisions).toHaveLength(1);
      expect(bidInDb?.attachments).toHaveLength(1);
    });

    it('returns 409 if user already has an active bid', async () => {
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'First bid' })
        .expect(201);

      const dupRes = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 8, message: 'Second bid' })
        .expect(409);

      expect(dupRes.body.error.code).toBe('CONFLICT');
    });

    it('concurrency test: Promise.all two creates by same user -> exactly one 201, one 409', async () => {
      const p1 = request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Concurrent 1' });

      const p2 = request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 46000, currency: 'USD', deliveryDays: 9, message: 'Concurrent 2' });

      const [r1, r2] = await Promise.all([p1, p2]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Exactly one bid in DB for this user
      const count = await prisma.bid.count({
        where: { listingId: openListingId, bidderId },
      });
      expect(count).toBe(1);
    });
  });

  describe('GET /api/v1/listings/:id/bids', () => {
    let bid1Id: string;
    let bid2Id: string;

    beforeEach(async () => {
      // Create rating for bidder 1
      await prisma.user.update({
        where: { id: bidderId },
        data: { ratingAvg: 4.8 },
      });
      // Create rating for bidder 2
      await prisma.user.update({
        where: { id: bidder2Id },
        data: { ratingAvg: 3.5 },
      });

      const b1 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Bidder 1' })
        .expect(201);
      bid1Id = b1.body.id;

      const b2 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidder2Token}`)
        .send({ amountCents: 50000, currency: 'USD', deliveryDays: 5, message: 'Bidder 2' })
        .expect(201);
      bid2Id = b2.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server).get(`/api/v1/listings/${openListingId}/bids`).expect(401);
    });

    it('returns 404 when a third user with no bids accesses the listing bids', async () => {
      await request(server)
        .get(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${thirdToken}`)
        .expect(404);
    });

    it('returns 404 when listing does not exist', async () => {
      await request(server)
        .get('/api/v1/listings/non-existent-id/bids')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('non-owner bidder sees only their own bids', async () => {
      const res = await request(server)
        .get(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].id).toBe(bid1Id);
      expect(res.body.items[0].bidder.id).toBe(bidderId);
    });

    it('owner sees all bids sorted by newest, amount_asc, amount_desc, delivery, rating', async () => {
      // Sort newest
      const resNewest = await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?sort=newest`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(resNewest.body.items).toHaveLength(2);
      expect(resNewest.body.items[0].id).toBe(bid2Id);

      // Sort amount_asc
      const resAmtAsc = await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?sort=amount_asc`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(resAmtAsc.body.items[0].amountCents).toBe(40000);
      expect(resAmtAsc.body.items[1].amountCents).toBe(50000);

      // Sort amount_desc
      const resAmtDesc = await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?sort=amount_desc`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(resAmtDesc.body.items[0].amountCents).toBe(50000);
      expect(resAmtDesc.body.items[1].amountCents).toBe(40000);

      // Sort delivery
      const resDelivery = await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?sort=delivery`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(resDelivery.body.items[0].deliveryDays).toBe(5); // bidder 2
      expect(resDelivery.body.items[1].deliveryDays).toBe(10); // bidder 1

      // Sort rating
      const resRating = await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?sort=rating`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(resRating.body.items[0].bidder.ratingAvg).toBe(4.8); // bidder 1
      expect(resRating.body.items[1].bidder.ratingAvg).toBe(3.5); // bidder 2
    });

    it('paginates stably with cursor under ties', async () => {
      // Create third bid with identical amount to bid1 (40000)
      const u4 = await createUser({ email: 'bidder4@market.test' });
      const u4Token = signToken(app, { id: u4.id, role: 'USER' });
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${u4Token}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 7, message: 'Tie bid' })
        .expect(201);

      // Page 1: limit=1 sort=amount_asc
      const page1 = await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?sort=amount_asc&limit=1`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(page1.body.items).toHaveLength(1);
      expect(page1.body.nextCursor).toBeDefined();

      // Page 2: with cursor
      const page2 = await request(server)
        .get(
          `/api/v1/listings/${openListingId}/bids?sort=amount_asc&limit=1&cursor=${page1.body.nextCursor}`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);

      // Page 3: with cursor
      const page3 = await request(server)
        .get(
          `/api/v1/listings/${openListingId}/bids?sort=amount_asc&limit=1&cursor=${page2.body.nextCursor}`,
        )
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(page3.body.items).toHaveLength(1);
      const allFetchedIds = [
        page1.body.items[0].id,
        page2.body.items[0].id,
        page3.body.items[0].id,
      ];
      expect(new Set(allFetchedIds).size).toBe(3);
    });

    it('returns 400 when cursor is malformed or sort value type mismatches', async () => {
      // 1. Invalid base64 or non-JSON
      await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?cursor=not-a-valid-cursor`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);

      // 2. Cursor with NUL byte
      await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?cursor=bad%00cursor`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);

      // 3. Sort mismatch: cursor for newest (ISO string) used on amount_asc
      const newestCursor = encodeBidCursor('newest', new Date().toISOString(), 'bid1');
      await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?sort=amount_asc&cursor=${newestCursor}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);

      // 4. Integer overflow or float on amount_asc
      const overflowCursor = Buffer.from(JSON.stringify({ v: 99999999999, id: 'bid1' })).toString(
        'base64url',
      );
      await request(server)
        .get(`/api/v1/listings/${openListingId}/bids?sort=amount_asc&cursor=${overflowCursor}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(400);
    });
  });

  describe('GET /api/v1/bids/mine', () => {
    it('returns 401 when unauthenticated', async () => {
      await request(server).get('/api/v1/bids/mine').expect(401);
    });

    it('returns 400 when cursor contains NUL byte or invalid characters', async () => {
      await request(server)
        .get('/api/v1/bids/mine?cursor=bad%00cursor')
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(400);

      await request(server)
        .get('/api/v1/bids/mine?cursor=bad+cursor+with+spaces')
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(400);
    });

    it('returns only the user bids with listing summary and filters by status', async () => {
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Bidder 1' })
        .expect(201);

      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidder2Token}`)
        .send({ amountCents: 50000, currency: 'USD', deliveryDays: 5, message: 'Bidder 2' })
        .expect(201);

      const res = await request(server)
        .get('/api/v1/bids/mine')
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].bidder.id).toBe(bidderId);
      expect(res.body.items[0].listing.id).toBe(openListingId);
      expect(res.body.items[0].listing.owner.id).toBe(ownerId);

      // Filter status
      const resFiltered = await request(server)
        .get('/api/v1/bids/mine?status=REJECTED')
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);
      expect(resFiltered.body.items).toHaveLength(0);
    });
  });

  describe('GET /api/v1/bids/:id', () => {
    let bidId: string;

    beforeEach(async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'First revision' })
        .expect(201);
      bidId = b.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server).get(`/api/v1/bids/${bidId}`).expect(401);
    });

    it('returns 404 when bid does not exist', async () => {
      await request(server)
        .get('/api/v1/bids/non-existent-bid')
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(404);
    });

    it('returns 403 when third user tries to view bid', async () => {
      await request(server)
        .get(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${thirdToken}`)
        .expect(403);
    });

    it('allows bidder or owner to view bid detail with revision history', async () => {
      const resBidder = await request(server)
        .get(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      expect(resBidder.body.id).toBe(bidId);
      expect(resBidder.body.revisions).toHaveLength(1);
      expect(resBidder.body.revisions[0].author.id).toBe(bidderId);

      const resOwner = await request(server)
        .get(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(resOwner.body.id).toBe(bidId);
    });
  });

  describe('PATCH /api/v1/bids/:id', () => {
    let bidId: string;

    beforeEach(async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Initial' })
        .expect(201);
      bidId = b.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server).patch(`/api/v1/bids/${bidId}`).send({ amountCents: 42000 }).expect(401);
    });

    it('returns 403 when non-bidder (owner or third user) attempts to edit', async () => {
      await request(server)
        .patch(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 42000 })
        .expect(403);

      await request(server)
        .patch(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${thirdToken}`)
        .send({ amountCents: 42000 })
        .expect(403);
    });

    it('edits PENDING bid: creates new revision and updates amounts', async () => {
      const res = await request(server)
        .patch(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 38000, deliveryDays: 8, message: 'Updated proposal' })
        .expect(200);

      expect(res.body.amountCents).toBe(38000);
      expect(res.body.deliveryDays).toBe(8);
      expect(res.body.message).toBe('Updated proposal');
      expect(res.body.status).toBe('PENDING');
      expect(res.body.revisions).toHaveLength(2);
      expect(res.body.revisions[1].amountCents).toBe(38000);
    });

    it('resets status to PENDING when editing a COUNTERED bid', async () => {
      // Owner counters first
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 35000, deliveryDays: 7, message: 'Would you do 35000?' })
        .expect(200);

      // Verify bid is COUNTERED
      const countered = await prisma.bid.findUnique({ where: { id: bidId } });
      expect(countered?.status).toBe('COUNTERED');

      // Bidder edits
      const res = await request(server)
        .patch(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 37000, message: 'How about 37000?' })
        .expect(200);

      expect(res.body.status).toBe('PENDING');
      expect(res.body.amountCents).toBe(37000);
      expect(res.body.revisions).toHaveLength(3);
    });

    it('returns 409 when attempting to edit ACCEPTED, WITHDRAWN, or REJECTED bid', async () => {
      // Test WITHDRAWN
      await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      await request(server)
        .patch(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 41000 })
        .expect(409);

      // Create new bid and REJECT it
      const b2 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid 2' })
        .expect(201);
      await request(server)
        .post(`/api/v1/bids/${b2.body.id}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Rejected' })
        .expect(200);

      await request(server)
        .patch(`/api/v1/bids/${b2.body.id}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 41000 })
        .expect(409);

      // Create new bid and ACCEPT it
      const b3 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid 3' })
        .expect(201);
      await request(server)
        .post(`/api/v1/bids/${b3.body.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      await request(server)
        .patch(`/api/v1/bids/${b3.body.id}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 41000 })
        .expect(409);
    });
  });

  describe('POST /api/v1/bids/:id/withdraw', () => {
    let bidId: string;

    beforeEach(async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Initial' })
        .expect(201);
      bidId = b.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server).post(`/api/v1/bids/${bidId}/withdraw`).expect(401);
    });

    it('returns 403 when non-bidder (owner) attempts to withdraw', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });

    it('returns 404 when bid does not exist', async () => {
      await request(server)
        .post('/api/v1/bids/nonexistent-id/withdraw')
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(404);
    });

    it('allows bidder to withdraw bid -> WITHDRAWN', async () => {
      const res = await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      expect(res.body.status).toBe('WITHDRAWN');

      // Second withdraw returns 409
      await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(409);
    });

    it('returns 409 when attempting to withdraw an ACCEPTED or REJECTED bid', async () => {
      // Reject bid -> withdraw returns 409
      await request(server)
        .post(`/api/v1/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Rejected' })
        .expect(200);

      await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(409);

      // New bid and accept -> withdraw returns 409
      const b2 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 42000, currency: 'USD', deliveryDays: 5, message: 'New bid' })
        .expect(201);

      await request(server)
        .post(`/api/v1/bids/${b2.body.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      await request(server)
        .post(`/api/v1/bids/${b2.body.id}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(409);
    });
  });

  describe('POST /api/v1/bids/:id/shortlist', () => {
    let bidId: string;

    beforeEach(async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Initial' })
        .expect(201);
      bidId = b.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server).post(`/api/v1/bids/${bidId}/shortlist`).expect(401);
    });

    it('returns 403 when non-owner (bidder) attempts to shortlist', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/shortlist`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(403);
    });

    it('returns 404 when bid does not exist', async () => {
      await request(server)
        .post('/api/v1/bids/nonexistent-id/shortlist')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('allows owner to shortlist bid -> SHORTLISTED', async () => {
      const res = await request(server)
        .post(`/api/v1/bids/${bidId}/shortlist`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.status).toBe('SHORTLISTED');

      // Shortlisting an already shortlisted bid returns 409
      await request(server)
        .post(`/api/v1/bids/${bidId}/shortlist`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    });

    it('returns 409 when attempting to shortlist WITHDRAWN, REJECTED, or ACCEPTED bid', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      await request(server)
        .post(`/api/v1/bids/${bidId}/shortlist`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    });
  });

  describe('POST /api/v1/bids/:id/reject', () => {
    let bidId: string;

    beforeEach(async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Initial' })
        .expect(201);
      bidId = b.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server).post(`/api/v1/bids/${bidId}/reject`).send({ reason: 'No' }).expect(401);
    });

    it('returns 403 when non-owner attempts to reject', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ reason: 'No' })
        .expect(403);
    });

    it('returns 404 when bid does not exist', async () => {
      await request(server)
        .post('/api/v1/bids/nonexistent-id/reject')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'No' })
        .expect(404);
    });

    it('returns 400 when reject body is invalid', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'x'.repeat(2001) })
        .expect(400);
    });

    it('allows owner to reject bid with optional reason -> REJECTED', async () => {
      const res = await request(server)
        .post(`/api/v1/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Over budget' })
        .expect(200);

      expect(res.body.status).toBe('REJECTED');
      expect(res.body.rejectReason).toBe('Over budget');

      // Rejecting a terminal bid returns 409
      await request(server)
        .post(`/api/v1/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Again' })
        .expect(409);
    });

    it('returns 409 when attempting to reject WITHDRAWN or ACCEPTED bid', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      await request(server)
        .post(`/api/v1/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Reject after withdraw' })
        .expect(409);
    });
  });

  describe('POST /api/v1/bids/:id/counter', () => {
    let bidId: string;

    beforeEach(async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Initial' })
        .expect(201);
      bidId = b.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .send({ amountCents: 35000, deliveryDays: 8, message: 'Counter' })
        .expect(401);
    });

    it('returns 403 when non-owner attempts to counter', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 35000, deliveryDays: 8, message: 'Counter' })
        .expect(403);
    });

    it('returns 404 when bid does not exist', async () => {
      await request(server)
        .post('/api/v1/bids/nonexistent-id/counter')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 35000, deliveryDays: 8, message: 'Counter' })
        .expect(404);
    });

    it('returns 400 when counter body is invalid', async () => {
      // Invalid negative amount
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: -100, deliveryDays: 5, message: 'Counter' })
        .expect(400);

      // Missing deliveryDays
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 1000, message: 'Counter' })
        .expect(400);

      // Zero amount
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 0, deliveryDays: 5, message: 'Counter' })
        .expect(400);

      // Message too long (> 5000 chars)
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 1000, deliveryDays: 5, message: 'x'.repeat(5001) })
        .expect(400);
    });

    it('allows owner to counter: sets COUNTERED, records revision and lastCounterById', async () => {
      const res = await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 35000, deliveryDays: 8, message: 'I offer 35000' })
        .expect(200);

      expect(res.body.status).toBe('COUNTERED');
      expect(res.body.lastCounterById).toBe(ownerId);
      expect(res.body.revisions).toHaveLength(2);
      expect(res.body.revisions[1].author.id).toBe(ownerId);
      expect(res.body.revisions[1].amountCents).toBe(35000);
      expect(res.body.revisions[1].deliveryDays).toBe(8);
      expect(res.body.revisions[1].message).toBe('I offer 35000');
    });

    it('returns 409 when attempting to counter WITHDRAWN, REJECTED, or ACCEPTED bid', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 35000, deliveryDays: 8, message: 'Counter' })
        .expect(409);
    });
  });

  describe('POST /api/v1/bids/:id/accept', () => {
    let bidId: string;

    beforeEach(async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Initial' })
        .expect(201);
      bidId = b.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server).post(`/api/v1/bids/${bidId}/accept`).expect(401);
    });

    it('returns 403 when non-owner (bidder or third user) attempts to accept', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(403);

      await request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${thirdToken}`)
        .expect(403);
    });

    it('returns 404 when bid does not exist', async () => {
      await request(server)
        .post('/api/v1/bids/nonexistent-id/accept')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    });

    it('returns 409 when bid is in terminal status (WITHDRAWN or REJECTED)', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      await request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    });

    it('returns 409 when listing is closed (not OPEN)', async () => {
      await request(server)
        .post(`/api/v1/listings/${openListingId}/close`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(201);

      await request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);
    });
  });

  describe('POST /api/v1/bids/:id/accept-counter', () => {
    let bidId: string;

    beforeEach(async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 40000, currency: 'USD', deliveryDays: 10, message: 'Initial' })
        .expect(201);
      bidId = b.body.id;
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server).post(`/api/v1/bids/${bidId}/accept-counter`).expect(401);
    });

    it('returns 403 when owner or third user attempts to accept-counter', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/accept-counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);

      await request(server)
        .post(`/api/v1/bids/${bidId}/accept-counter`)
        .set('Authorization', `Bearer ${thirdToken}`)
        .expect(403);
    });

    it('returns 404 when bid does not exist', async () => {
      await request(server)
        .post('/api/v1/bids/nonexistent-id/accept-counter')
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(404);
    });

    it('returns 409 when bid is not COUNTERED (e.g. still PENDING)', async () => {
      await request(server)
        .post(`/api/v1/bids/${bidId}/accept-counter`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(409);
    });
  });

  describe('Negotiation thread & Acceptance flow', () => {
    it('full negotiation thread: bid -> counter -> edit -> counter -> accept-counter on REQUEST listing', async () => {
      // 1. Bidder creates initial bid: 45000 USD, 12 days
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 12, message: 'Bid 1' })
        .expect(201);
      const bidId = b.body.id;

      // 2. Owner counters with 38000 USD, 10 days
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 38000, deliveryDays: 10, message: 'Can you do 38000 in 10 days?' })
        .expect(200);

      // 3. Bidder edits to 42000 USD, 11 days (resets to PENDING)
      const edited = await request(server)
        .patch(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 42000, deliveryDays: 11, message: 'Split the difference at 42000?' })
        .expect(200);
      expect(edited.body.status).toBe('PENDING');

      // 4. Owner counters again with 40000 USD, 10 days
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 40000, deliveryDays: 10, message: 'Final offer 40000' })
        .expect(200);

      // 5. Bidder accepts counter
      const acceptRes = await request(server)
        .post(`/api/v1/bids/${bidId}/accept-counter`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      // Check bid: amount and delivery days updated from the counter
      expect(acceptRes.body.bid.status).toBe('ACCEPTED');
      expect(acceptRes.body.bid.amountCents).toBe(40000);
      expect(acceptRes.body.bid.deliveryDays).toBe(10);

      // Check Agreement: REQUEST listing -> owner is buyer, bidder is provider
      expect(acceptRes.body.agreement.status).toBe('ACTIVE');
      expect(acceptRes.body.agreement.buyer.id).toBe(ownerId);
      expect(acceptRes.body.agreement.provider.id).toBe(bidderId);
      expect(acceptRes.body.agreement.events).toHaveLength(1);
      expect(acceptRes.body.agreement.events[0].type).toBe('CREATED');

      // Check listing is now IN_PROGRESS
      const listingInDb = await prisma.listing.findUnique({ where: { id: openListingId } });
      expect(listingInDb?.status).toBe('IN_PROGRESS');

      // Check Conversation created between owner and bidder
      const conv = await prisma.conversation.findFirst({
        where: { listingId: openListingId, agreementId: acceptRes.body.agreement.id },
        include: { participants: true },
      });
      expect(conv).toBeDefined();
      expect(conv?.participants.map((p) => p.userId).sort()).toEqual([bidderId, ownerId].sort());
    });

    it('acceptance on OFFER listing: owner=provider, bidder=buyer', async () => {
      const offerListing = await prisma.listing.create({
        data: {
          ownerId,
          categoryId,
          kind: 'OFFER',
          status: 'OPEN',
          title: 'Consulting services offered',
          description: 'Consulting services offer description',
          priceType: 'FIXED',
          priceMinCents: 20000,
        },
      });

      const b = await request(server)
        .post(`/api/v1/listings/${offerListing.id}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({
          amountCents: 20000,
          currency: 'USD',
          deliveryDays: 5,
          message: 'I accept your offer',
        })
        .expect(201);

      const acceptRes = await request(server)
        .post(`/api/v1/bids/${b.body.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(acceptRes.body.bid.status).toBe('ACCEPTED');
      // In OFFER listing: owner is provider, bidder is buyer
      expect(acceptRes.body.agreement.buyer.id).toBe(bidderId);
      expect(acceptRes.body.agreement.provider.id).toBe(ownerId);
    });

    it('accept declines all other active bids on the listing', async () => {
      const b1 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bidder 1' })
        .expect(201);

      const b2 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidder2Token}`)
        .send({ amountCents: 48000, currency: 'USD', deliveryDays: 8, message: 'Bidder 2' })
        .expect(201);

      // Owner accepts bid 1
      await request(server)
        .post(`/api/v1/bids/${b1.body.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // Bid 2 must now be DECLINED
      const bid2InDb = await prisma.bid.findUnique({ where: { id: b2.body.id } });
      expect(bid2InDb?.status).toBe('DECLINED');
    });

    it('concurrency test on accept: Promise.all two accepts on different bids -> exactly one 200, one 409', async () => {
      const b1 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bidder 1' })
        .expect(201);

      const b2 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidder2Token}`)
        .send({ amountCents: 48000, currency: 'USD', deliveryDays: 8, message: 'Bidder 2' })
        .expect(201);

      const p1 = request(server)
        .post(`/api/v1/bids/${b1.body.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const p2 = request(server)
        .post(`/api/v1/bids/${b2.body.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const [r1, r2] = await Promise.all([p1, p2]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Exactly one agreement in DB
      const agreementCount = await prisma.agreement.count({
        where: { listingId: openListingId },
      });
      expect(agreementCount).toBe(1);

      // One bid is ACCEPTED and the other is DECLINED
      const bidsInDb = await prisma.bid.findMany({
        where: { listingId: openListingId },
      });
      const dbStatuses = bidsInDb.map((b) => b.status).sort();
      expect(dbStatuses).toEqual(['ACCEPTED', 'DECLINED']);
    });

    it('concurrency: accept vs withdraw in parallel -> exactly one 200, one 409', async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(201);
      const bidId = b.body.id;

      const pAccept = request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const pWithdraw = request(server)
        .post(`/api/v1/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`);

      const [rAccept, rWithdraw] = await Promise.all([pAccept, pWithdraw]);
      const statuses = [rAccept.status, rWithdraw.status].sort();
      expect(statuses).toEqual([200, 409]);

      const bidInDb = await prisma.bid.findUnique({ where: { id: bidId } });
      const listingInDb = await prisma.listing.findUnique({ where: { id: openListingId } });

      if (rAccept.status === 200) {
        expect(bidInDb?.status).toBe('ACCEPTED');
        expect(listingInDb?.status).toBe('IN_PROGRESS');
      } else {
        expect(bidInDb?.status).toBe('WITHDRAWN');
        expect(listingInDb?.status).toBe('OPEN');
      }
    });

    it('concurrency: accept vs edit in parallel -> exactly one 200, one 409', async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(201);
      const bidId = b.body.id;

      const pAccept = request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const pEdit = request(server)
        .patch(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 99999, message: 'Changed my price' });

      const [rAccept, rEdit] = await Promise.all([pAccept, pEdit]);
      const statuses = [rAccept.status, rEdit.status].sort();
      expect(statuses).toEqual([200, 409]);
    });

    it('concurrency: accept vs reject in parallel -> exactly one 200, one 409', async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(201);
      const bidId = b.body.id;

      const pAccept = request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const pReject = request(server)
        .post(`/api/v1/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Too expensive' });

      const [rAccept, rReject] = await Promise.all([pAccept, pReject]);
      const statuses = [rAccept.status, rReject.status].sort();
      expect(statuses).toEqual([200, 409]);

      const bidInDb = await prisma.bid.findUnique({ where: { id: bidId } });
      if (rAccept.status === 200) {
        expect(bidInDb?.status).toBe('ACCEPTED');
      } else {
        expect(bidInDb?.status).toBe('REJECTED');
      }
    });

    it('concurrency: accept vs counter in parallel -> exactly one 200, one 409', async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(201);
      const bidId = b.body.id;

      const pAccept = request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const pCounter = request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 38000, deliveryDays: 7, message: 'Counter offer' });

      const [rAccept, rCounter] = await Promise.all([pAccept, pCounter]);
      const statuses = [rAccept.status, rCounter.status].sort();
      expect(statuses).toEqual([200, 409]);
    });

    it('concurrency: accept vs close in parallel -> exactly one outcome, cannot both succeed', async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(201);
      const bidId = b.body.id;

      const pAccept = request(server)
        .post(`/api/v1/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const pClose = request(server)
        .post(`/api/v1/listings/${openListingId}/close`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const [rAccept, rClose] = await Promise.all([pAccept, pClose]);
      const listingInDb = await prisma.listing.findUnique({ where: { id: openListingId } });
      const bidInDb = await prisma.bid.findUnique({ where: { id: bidId } });

      if (rAccept.status === 200) {
        expect(rClose.status).toBe(409);
        expect(listingInDb?.status).toBe('IN_PROGRESS');
        expect(bidInDb?.status).toBe('ACCEPTED');
      } else {
        expect(rAccept.status).toBe(409);
        expect(rClose.status).toBe(201);
        expect(listingInDb?.status).toBe('CLOSED');
        expect(bidInDb?.status).toBe('DECLINED');
      }
    });

    it('concurrency: create bid vs close listing in parallel -> closed listing cannot have PENDING bid', async () => {
      const pCreate = request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' });

      const pClose = request(server)
        .post(`/api/v1/listings/${openListingId}/close`)
        .set('Authorization', `Bearer ${ownerToken}`);

      await Promise.all([pCreate, pClose]);

      const listingInDb = await prisma.listing.findUnique({ where: { id: openListingId } });
      const bidsInDb = await prisma.bid.findMany({ where: { listingId: openListingId } });

      if (listingInDb?.status === 'CLOSED') {
        const pendingBids = bidsInDb.filter((b) => b.status === 'PENDING');
        expect(pendingBids).toHaveLength(0);
      }
    });
  });

  describe('Listing detail myBid and bidCount', () => {
    it('returns myBid only for active bids and counts only active+accepted in bidCount', async () => {
      // 1. Initial listing detail has no bids
      const d0 = await request(server)
        .get(`/api/v1/listings/${openListingId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);
      expect(d0.body.myBid).toBeNull();
      expect(d0.body.bidCount).toBe(0);

      // 2. Bidder creates bid
      const b1 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(201);

      // Detail seen by bidder: myBid is present, bidCount is 1
      const d1 = await request(server)
        .get(`/api/v1/listings/${openListingId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);
      expect(d1.body.myBid?.id).toBe(b1.body.id);
      expect(d1.body.bidCount).toBe(1);

      // Detail seen by third user: myBid is null, bidCount is 1
      const dThird = await request(server)
        .get(`/api/v1/listings/${openListingId}`)
        .set('Authorization', `Bearer ${thirdToken}`)
        .expect(200);
      expect(dThird.body.myBid).toBeNull();
      expect(dThird.body.bidCount).toBe(1);

      // 3. Bidder withdraws bid
      await request(server)
        .post(`/api/v1/bids/${b1.body.id}/withdraw`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      // Withdrawn bid is NOT active -> myBid is null, bidCount does NOT count withdrawn
      const dWithdrawn = await request(server)
        .get(`/api/v1/listings/${openListingId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);
      expect(dWithdrawn.body.myBid).toBeNull();
      expect(dWithdrawn.body.bidCount).toBe(0);

      // 4. Now bidder2 bids and owner accepts
      const b2 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidder2Token}`)
        .send({ amountCents: 48000, currency: 'USD', deliveryDays: 8, message: 'Bid 2' })
        .expect(201);

      await request(server)
        .post(`/api/v1/bids/${b2.body.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // ACCEPTED bid IS counted in bidCount
      const dAccepted = await request(server)
        .get(`/api/v1/listings/${openListingId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(dAccepted.body.bidCount).toBe(1);
    });

    it('preserves agreement and bid currency consistency during concurrent acceptance and edit', async () => {
      const b2 = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidder2Token}`)
        .send({ amountCents: 46000, currency: 'USD', deliveryDays: 12, message: 'Bid 2' })
        .expect(201);
      const bid2Id = b2.body.id;

      const pAccept = request(server)
        .post(`/api/v1/bids/${bid2Id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`);

      const pEditCurrency = request(server)
        .patch(`/api/v1/bids/${bid2Id}`)
        .set('Authorization', `Bearer ${bidder2Token}`)
        .send({ currency: 'EUR' });

      const [rAccept, rEdit] = await Promise.all([pAccept, pEditCurrency]);
      expect([rAccept.status, rEdit.status]).toContain(200);

      const finalBid = await prisma.bid.findUniqueOrThrow({ where: { id: bid2Id } });
      const agreement = await prisma.agreement.findFirst({
        where: { bidId: bid2Id },
        include: { bid: true },
      });

      if (agreement) {
        expect(finalBid.status).toBe('ACCEPTED');
        expect(agreement.bid.currency).toBe(finalBid.currency);
      }
    });

    it('forbids changing kind on listing that has bids with 409', async () => {
      await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid' })
        .expect(201);

      await request(server)
        .patch(`/api/v1/listings/${openListingId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ kind: 'OFFER' })
        .expect(409);
    });

    it('orders revision history and counter lookup by seq as primary ordering', async () => {
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Initial bid' })
        .expect(201);
      const bidId = b.body.id;

      // 1. Owner counters
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 40000, deliveryDays: 8, message: 'First counter' })
        .expect(200);

      // 2. Bidder edits
      await request(server)
        .patch(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 42000, deliveryDays: 9, message: 'Second proposal' })
        .expect(200);

      // 3. Owner counters again
      await request(server)
        .post(`/api/v1/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 39000, deliveryDays: 7, message: 'Second counter' })
        .expect(200);

      // Fetch bid details and verify revision history is ordered by seq ascending
      const detail = await request(server)
        .get(`/api/v1/bids/${bidId}`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      const revisions = (detail.body as { revisions: Array<{ amountCents: number }> }).revisions;
      expect(revisions.length).toBe(4);
      expect(revisions.map((r) => r.amountCents)).toEqual([45000, 40000, 42000, 39000]);

      // When bidder accepts counter, it accepts the latest counter (39000, 7 days)
      const acceptRes = await request(server)
        .post(`/api/v1/bids/${bidId}/accept-counter`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .expect(200);

      expect(acceptRes.body.bid.amountCents).toBe(39000);
      expect(acceptRes.body.bid.deliveryDays).toBe(7);
    });

    it('invalidates categories cache after accept: /categories count drops right after an accept', async () => {
      // 1. Check categories before: listing is OPEN so category listingCount is at least 1
      const initialCatRes = await request(server).get('/api/v1/categories').expect(200);
      const catNodeInitial = (
        initialCatRes.body as Array<{ id: string; listingCount: number }>
      ).find((c) => c.id === categoryId);
      const initialCount = catNodeInitial?.listingCount ?? 0;
      expect(initialCount).toBeGreaterThan(0);

      // 2. Submit bid and accept it
      const b = await request(server)
        .post(`/api/v1/listings/${openListingId}/bids`)
        .set('Authorization', `Bearer ${bidderToken}`)
        .send({ amountCents: 45000, currency: 'USD', deliveryDays: 10, message: 'Bid to accept' })
        .expect(201);

      await request(server)
        .post(`/api/v1/bids/${b.body.id}/accept`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      // 3. Immediately query categories: cache must have been invalidated and count dropped by 1
      const afterCatRes = await request(server).get('/api/v1/categories').expect(200);
      const catNodeAfter = (afterCatRes.body as Array<{ id: string; listingCount: number }>).find(
        (c) => c.id === categoryId,
      );
      expect(catNodeAfter?.listingCount).toBe(initialCount - 1);
    });
  });
});
