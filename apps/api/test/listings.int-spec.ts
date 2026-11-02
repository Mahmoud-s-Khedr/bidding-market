import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { encodeCursor } from '../src/modules/listings/listings.cursor.js';
import { createTestApp } from './helpers/app.js';
import { createAdmin, createUser, signToken } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';

describe('Listings endpoints', () => {
  let app: INestApplication;
  let server: Server;
  let adminToken: string;
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;
  let user2Id: string;
  let categoryId: string;
  let categorySlug: string;
  let subCategoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb();
    const admin = await createAdmin('admin@market.test');
    const u1 = await createUser({ email: 'user1@market.test' });
    const u2 = await createUser({ email: 'user2@market.test' });

    user1Id = u1.id;
    user2Id = u2.id;
    adminToken = signToken(app, { id: admin.id, role: 'ADMIN' });
    user1Token = signToken(app, { id: u1.id, role: 'USER' });
    user2Token = signToken(app, { id: u2.id, role: 'USER' });

    const parentCat = await prisma.category.create({
      data: { name: 'Technology', slug: 'tech' },
    });
    const subCat = await prisma.category.create({
      data: { name: 'Web Dev', slug: 'web-dev', parentId: parentCat.id },
    });

    categoryId = parentCat.id;
    categorySlug = parentCat.slug;
    subCategoryId = subCat.id;
  });

  describe('POST /api/v1/listings', () => {
    it('creates listing with READY images and attachments (201)', async () => {
      const imgUpload = await prisma.upload.create({
        data: {
          uploaderId: user1Id,
          purpose: 'LISTING_IMAGE',
          status: 'READY',
          key: 'listing_image/u1/c1/img.png',
          fileName: 'img.png',
          mimeType: 'image/png',
          sizeBytes: 100,
        },
      });
      const attUpload = await prisma.upload.create({
        data: {
          uploaderId: user1Id,
          purpose: 'LISTING_ATTACHMENT',
          status: 'READY',
          key: 'listing_attachment/u1/c2/doc.pdf',
          fileName: 'doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 200,
        },
      });

      const res = await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          kind: 'REQUEST',
          title: 'Build a Next.js application',
          description: 'A sufficiently long description for creating a listing properly.',
          categoryId,
          priceType: 'RANGE',
          priceMinCents: 50000,
          priceMaxCents: 100000,
          currency: 'USD',
          deliveryDays: 14,
          location: 'San Francisco, CA',
          tags: ['nextjs', 'react'],
          imageIds: [imgUpload.id],
          attachmentIds: [attUpload.id],
          status: 'OPEN',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Build a Next.js application');
      expect(res.body.owner.id).toBe(user1Id);
      expect(res.body.category.id).toBe(categoryId);
      expect(res.body.images).toHaveLength(1);
      expect(res.body.images[0].id).toBe(imgUpload.id);
      expect(res.body.attachments).toHaveLength(1);
      expect(res.body.attachments[0].id).toBe(attUpload.id);
      expect(res.body.bidCount).toBe(0);
      expect(res.body.myBid).toBeNull();
    });

    it('rejects invalid price rules with 400', async () => {
      const base = {
        kind: 'REQUEST',
        title: 'Title that is long enough',
        description: 'A sufficiently long description for creating a listing properly.',
        categoryId,
      };

      // FIXED without min
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ ...base, priceType: 'FIXED' })
        .expect(400);

      // FIXED with max
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ ...base, priceType: 'FIXED', priceMinCents: 1000, priceMaxCents: 2000 })
        .expect(400);

      // RANGE min > max
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ ...base, priceType: 'RANGE', priceMinCents: 2000, priceMaxCents: 1000 })
        .expect(400);

      // NEGOTIABLE with price
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ ...base, priceType: 'NEGOTIABLE', priceMinCents: 1000 })
        .expect(400);
    });

    it('returns 400 on non-existent categoryId', async () => {
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          kind: 'REQUEST',
          title: 'Title that is long enough',
          description: 'A sufficiently long description for creating a listing properly.',
          categoryId: 'non-existent-category',
          priceType: 'NEGOTIABLE',
        })
        .expect(400);
    });

    it('returns 400 when upload is not ready, not owned, or wrong purpose', async () => {
      const pendingUpload = await prisma.upload.create({
        data: {
          uploaderId: user1Id,
          purpose: 'LISTING_IMAGE',
          status: 'PENDING',
          key: 'pending-img.png',
          fileName: 'img.png',
          mimeType: 'image/png',
          sizeBytes: 100,
        },
      });
      const otherUserUpload = await prisma.upload.create({
        data: {
          uploaderId: user2Id,
          purpose: 'LISTING_IMAGE',
          status: 'READY',
          key: 'other-img.png',
          fileName: 'img.png',
          mimeType: 'image/png',
          sizeBytes: 100,
        },
      });
      const attachmentPurposeUpload = await prisma.upload.create({
        data: {
          uploaderId: user1Id,
          purpose: 'LISTING_ATTACHMENT',
          status: 'READY',
          key: 'att.pdf',
          fileName: 'doc.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 100,
        },
      });

      const base = {
        kind: 'REQUEST',
        title: 'Title that is long enough',
        description: 'A sufficiently long description for creating a listing properly.',
        categoryId,
        priceType: 'NEGOTIABLE',
      };

      // Upload not ready
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ ...base, imageIds: [pendingUpload.id] })
        .expect(400);

      // Upload not owned
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ ...base, imageIds: [otherUserUpload.id] })
        .expect(400);

      // Wrong purpose (attachment in imageIds)
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ ...base, imageIds: [attachmentPurposeUpload.id] })
        .expect(400);
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server)
        .post('/api/v1/listings')
        .send({
          kind: 'REQUEST',
          title: 'Title that is long enough',
          description: 'A sufficiently long description for creating a listing properly.',
          categoryId,
          priceType: 'NEGOTIABLE',
        })
        .expect(401);
    });
  });

  describe('PATCH /api/v1/listings/:id', () => {
    it('updates listing fields and returns detail (200)', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Original Title',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 5000,
        },
      });

      const res = await request(server)
        .patch(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ title: 'Updated Title', priceMinCents: 6000 })
        .expect(200);

      expect(res.body.title).toBe('Updated Title');
      expect(res.body.priceMinCents).toBe(6000);
    });

    it('returns 403 when updating another user listing', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'User 1 Listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      await request(server)
        .patch(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ title: 'Hacked Title' })
        .expect(403);
    });

    it('returns 409 when listing is IN_PROGRESS, COMPLETED, or REMOVED', async () => {
      for (const status of ['IN_PROGRESS', 'COMPLETED', 'REMOVED'] as const) {
        const listing = await prisma.listing.create({
          data: {
            ownerId: user1Id,
            categoryId,
            kind: 'REQUEST',
            status,
            title: `Listing ${status}`,
            description: 'A sufficiently long description for testing',
            priceType: 'NEGOTIABLE',
          },
        });

        await request(server)
          .patch(`/api/v1/listings/${listing.id}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ title: 'New Title' })
          .expect(409);
      }
    });

    it('returns 409 when attempting to reopen a CLOSED listing', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'CLOSED',
          title: 'Closed listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      await request(server)
        .patch(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ status: 'OPEN' })
        .expect(409);
    });

    it('returns 409 when owner attempts to revert OPEN listing with bids to DRAFT', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Open with bids to revert',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });
      await prisma.bid.create({
        data: {
          listingId: listing.id,
          bidderId: user2Id,
          amountCents: 1500,
          currency: 'USD',
          deliveryDays: 3,
          message: 'Active bid',
          status: 'PENDING',
        },
      });

      await request(server)
        .patch(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ status: 'DRAFT' })
        .expect(409);
    });

    it('allows admin to PATCH someone elses listing and validates uploads against the listing owner', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'User 1 Listing to edit',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      // Upload owned by user1
      const upload = await prisma.upload.create({
        data: {
          uploaderId: user1Id,
          purpose: 'LISTING_IMAGE',
          status: 'READY',
          key: `listing_image/${user1Id}/cuid-u1-img/img.jpg`,
          fileName: 'img.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
        },
      });

      const res = await request(server)
        .patch(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Admin Edited Title',
          imageIds: [upload.id],
        })
        .expect(200);

      expect(res.body.title).toBe('Admin Edited Title');
      expect(res.body.images).toHaveLength(1);
      expect(res.body.images[0].id).toBe(upload.id);
    });

    it('returns 409 when attempting to attach an upload already attached to another listing', async () => {
      const upload = await prisma.upload.create({
        data: {
          uploaderId: user1Id,
          purpose: 'LISTING_IMAGE',
          status: 'READY',
          key: `listing_image/${user1Id}/cuid-shared-img/img.jpg`,
          fileName: 'img.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 100,
        },
      });

      // Listing 1 has the upload
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Listing 1 With Upload',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
          images: {
            create: { uploadId: upload.id, position: 0 },
          },
        },
      });

      // Listing 2 tries to attach the same upload on creation -> 409
      await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          categoryId,
          kind: 'REQUEST',
          title: 'Listing 2 Duplicate Upload',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
          currency: 'USD',
          imageIds: [upload.id],
        })
        .expect(409);

      // Listing 3 created without upload, then patched with the same upload -> 409
      const listing3 = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Listing 3 Initially Clean',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      await request(server)
        .patch(`/api/v1/listings/${listing3.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ imageIds: [upload.id] })
        .expect(409);
    });
  });

  describe('POST /api/v1/listings/:id/close', () => {
    it('closes OPEN listing and declines pending/shortlisted/countered bids in transaction', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Listing to close',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      const bidPending = await prisma.bid.create({
        data: {
          listingId: listing.id,
          bidderId: user2Id,
          amountCents: 1000,
          currency: 'USD',
          deliveryDays: 3,
          message: 'bid 1',
          status: 'PENDING',
        },
      });
      const bidShortlisted = await prisma.bid.create({
        data: {
          listingId: listing.id,
          bidderId: user2Id,
          amountCents: 1200,
          currency: 'USD',
          deliveryDays: 4,
          message: 'bid 2',
          status: 'SHORTLISTED',
        },
      });

      const res = await request(server)
        .post(`/api/v1/listings/${listing.id}/close`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(201);

      expect(res.body.status).toBe('CLOSED');

      const b1 = await prisma.bid.findUnique({ where: { id: bidPending.id } });
      const b2 = await prisma.bid.findUnique({ where: { id: bidShortlisted.id } });
      expect(b1?.status).toBe('DECLINED');
      expect(b2?.status).toBe('DECLINED');
    });

    it('returns 409 if listing is not OPEN', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'DRAFT',
          title: 'Draft listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      await request(server)
        .post(`/api/v1/listings/${listing.id}/close`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(409);
    });

    it('returns 403 when called by non-owner', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Open listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      await request(server)
        .post(`/api/v1/listings/${listing.id}/close`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);
    });
  });

  describe('DELETE /api/v1/listings/:id', () => {
    it('deletes DRAFT listing even if it has bids (204)', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'DRAFT',
          title: 'Draft with bids',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });
      await prisma.bid.create({
        data: {
          listingId: listing.id,
          bidderId: user2Id,
          amountCents: 1000,
          currency: 'USD',
          deliveryDays: 3,
          message: 'bid on draft',
          status: 'PENDING',
        },
      });

      await request(server)
        .delete(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(204);

      const found = await prisma.listing.findUnique({ where: { id: listing.id } });
      expect(found).toBeNull();
    });

    it('deletes OPEN listing with 0 bids (204)', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Open zero bids',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      await request(server)
        .delete(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(204);
    });

    it('returns 409 when deleting OPEN listing with bids', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Open with bids',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });
      await prisma.bid.create({
        data: {
          listingId: listing.id,
          bidderId: user2Id,
          amountCents: 1000,
          currency: 'USD',
          deliveryDays: 3,
          message: 'bid on open',
          status: 'PENDING',
        },
      });

      await request(server)
        .delete(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(409);
    });
  });

  describe('GET /api/v1/listings/:id', () => {
    it('returns public view for anonymous users with myBid=null', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Public Open Listing',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 10000,
        },
      });

      const res = await request(server).get(`/api/v1/listings/${listing.id}`).expect(200);

      expect(res.body.id).toBe(listing.id);
      expect(res.body.owner.id).toBe(user1Id);
      expect(res.body.category.id).toBe(categoryId);
      expect(res.body.myBid).toBeNull();
    });

    it('includes myBid when user is authenticated and has bid', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Public Open Listing',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 10000,
        },
      });
      await prisma.bid.create({
        data: {
          listingId: listing.id,
          bidderId: user2Id,
          amountCents: 9500,
          currency: 'USD',
          deliveryDays: 5,
          message: 'My counter bid',
          status: 'PENDING',
        },
      });

      const res = await request(server)
        .get(`/api/v1/listings/${listing.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);

      expect(res.body.myBid).toBeDefined();
      expect(res.body.myBid.amountCents).toBe(9500);
      expect(res.body.myBid.bidder.id).toBe(user2Id);
    });

    it('returns 404 for DRAFT and REMOVED listings for non-owner/anonymous', async () => {
      const draft = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'DRAFT',
          title: 'Draft Listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });
      const removed = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'REMOVED',
          title: 'Removed Listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      // Anonymous -> 404
      await request(server).get(`/api/v1/listings/${draft.id}`).expect(404);
      await request(server).get(`/api/v1/listings/${removed.id}`).expect(404);

      // Other user -> 404
      await request(server)
        .get(`/api/v1/listings/${draft.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);
      await request(server)
        .get(`/api/v1/listings/${removed.id}`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);

      // Owner -> 200
      await request(server)
        .get(`/api/v1/listings/${draft.id}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      // Admin -> 200
      await request(server)
        .get(`/api/v1/listings/${removed.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('returns 401 when invalid token header is sent', async () => {
      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Open Listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      await request(server)
        .get(`/api/v1/listings/${listing.id}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('GET /api/v1/listings (search, filters, sort, stable cursor pagination)', () => {
    it('filters by category including descendants', async () => {
      // 1 listing in parent category, 1 in subcategory
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Parent category listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId: subCategoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Child category listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      // Filter by parent category -> returns BOTH (descendant included)
      const resParent = await request(server)
        .get(`/api/v1/listings?categoryId=${categoryId}`)
        .expect(200);
      expect(resParent.body.items).toHaveLength(2);

      // Filter by categorySlug -> returns BOTH
      const resSlug = await request(server)
        .get(`/api/v1/listings?categorySlug=${categorySlug}`)
        .expect(200);
      expect(resSlug.body.items).toHaveLength(2);

      // Filter by subcategory -> returns only child listing
      const resChild = await request(server)
        .get(`/api/v1/listings?categoryId=${subCategoryId}`)
        .expect(200);
      expect(resChild.body.items).toHaveLength(1);
    });

    it('performs Postgres full-text search with q and ranking', async () => {
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Build an e-commerce platform',
          description: 'Looking for developers with online shop experience',
          priceType: 'NEGOTIABLE',
        },
      });
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Machine learning model training',
          description: 'PyTorch and TensorFlow computer vision work',
          priceType: 'NEGOTIABLE',
        },
      });

      const res = await request(server)
        .get('/api/v1/listings?q=commerce&sort=relevance')
        .expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toContain('e-commerce');
    });

    it('filters by price overlap semantics', async () => {
      // Listing 1: FIXED at 1000
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Fixed price 1000',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 1000,
          priceMaxCents: null,
        },
      });
      // Listing 2: RANGE 2000 to 5000
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Range price 2000 to 5000',
          description: 'A sufficiently long description for testing',
          priceType: 'RANGE',
          priceMinCents: 2000,
          priceMaxCents: 5000,
        },
      });
      // Listing 3: NEGOTIABLE (excluded when price filter is given)
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Negotiable price',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      // Filter: minPrice = 3000 -> Listing 2 matches (max 5000 >= 3000), Listing 1 does not
      const resMin = await request(server).get('/api/v1/listings?minPrice=3000').expect(200);
      expect(resMin.body.items).toHaveLength(1);
      expect(resMin.body.items[0].title).toBe('Range price 2000 to 5000');

      // Filter: maxPrice = 1500 -> Listing 1 matches (1000 <= 1500), Listing 2 does not (min 2000 > 1500)
      const resMax = await request(server).get('/api/v1/listings?maxPrice=1500').expect(200);
      expect(resMax.body.items).toHaveLength(1);
      expect(resMax.body.items[0].title).toBe('Fixed price 1000');
    });

    it('excludes expired OPEN listings from default browse', async () => {
      // Active listing
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Active open listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
          expiresAt: new Date(Date.now() + 86400000), // tomorrow
        },
      });
      // Expired listing
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Expired open listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
          expiresAt: new Date(Date.now() - 86400000), // yesterday
        },
      });

      const res = await request(server).get('/api/v1/listings').expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].title).toBe('Active open listing');
    });

    it('supports ownerId=me for user own listings and forbids non-admin DRAFT query', async () => {
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'DRAFT',
          title: 'My draft listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'My open listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });
      await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'CLOSED',
          title: 'My closed listing',
          description: 'A sufficiently long description for testing',
          priceType: 'NEGOTIABLE',
        },
      });

      // Querying DRAFT without ownerId=me as non-admin -> 403
      await request(server)
        .get('/api/v1/listings?status=DRAFT')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(403);

      // ownerId=me without explicit status returns ALL caller's listings regardless of status
      const resAllMe = await request(server)
        .get('/api/v1/listings?ownerId=me')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      const allMeBody = resAllMe.body as { items: Array<{ id: string; status: string }> };
      expect(allMeBody.items).toHaveLength(3);
      const statuses = allMeBody.items.map((it) => it.status);
      expect(statuses).toContain('DRAFT');
      expect(statuses).toContain('OPEN');
      expect(statuses).toContain('CLOSED');

      // Querying with ownerId=me and explicit status=DRAFT -> returns only DRAFT
      const resMeDraft = await request(server)
        .get('/api/v1/listings?ownerId=me&status=DRAFT')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      expect(resMeDraft.body.items).toHaveLength(1);
      expect(resMeDraft.body.items[0].title).toBe('My draft listing');
    });

    it('returns 400 for malformed, tampered, or mismatched pagination cursors', async () => {
      // 1. Raw cuid / string id fallback is dropped -> 400
      await request(server).get('/api/v1/listings?sort=newest&cursor=cuid1234567890').expect(400);

      // 2. Malformed base64
      await request(server).get('/api/v1/listings?sort=newest&cursor=!!!not-base64!!!').expect(400);

      // 3. Tampered cursor with invalid date string for newest -> 400 (not 500)
      const tamperedGarbageDate = Buffer.from(
        JSON.stringify({ s: 'newest', v: 'garbage', id: 'x' }),
      ).toString('base64url');
      await request(server)
        .get(`/api/v1/listings?sort=newest&cursor=${tamperedGarbageDate}`)
        .expect(400);

      const tamperedOverflowDate = Buffer.from(
        JSON.stringify({ s: 'newest', v: '99999-99-99', id: 'x' }),
      ).toString('base64url');
      await request(server)
        .get(`/api/v1/listings?sort=newest&cursor=${tamperedOverflowDate}`)
        .expect(400);

      // 4. Tampered cursor with invalid date for ending_soon -> 400 (not 500)
      const tamperedEndingSoon = Buffer.from(
        JSON.stringify({ s: 'ending_soon', v: 'garbage', id: 'x' }),
      ).toString('base64url');
      await request(server)
        .get(`/api/v1/listings?sort=ending_soon&cursor=${tamperedEndingSoon}`)
        .expect(400);

      // 5. Wrong type of v for price_asc, most_bids, and relevance
      const tamperedPrice = Buffer.from(
        JSON.stringify({ s: 'price_asc', v: 'not-an-int', id: 'x' }),
      ).toString('base64url');
      await request(server)
        .get(`/api/v1/listings?sort=price_asc&cursor=${tamperedPrice}`)
        .expect(400);

      const tamperedBids = Buffer.from(
        JSON.stringify({ s: 'most_bids', v: 'not-an-int', id: 'x' }),
      ).toString('base64url');
      await request(server)
        .get(`/api/v1/listings?sort=most_bids&cursor=${tamperedBids}`)
        .expect(400);

      const tamperedRel = Buffer.from(
        JSON.stringify({ s: 'relevance', v: 'not-a-number', id: 'x' }),
      ).toString('base64url');
      await request(server)
        .get(`/api/v1/listings?q=test&sort=relevance&cursor=${tamperedRel}`)
        .expect(400);

      // 6. Cursor encoded for a different sort is rejected -> 400
      const cursorForNewest = encodeCursor('newest', new Date().toISOString(), 'x');
      await request(server)
        .get(`/api/v1/listings?sort=price_asc&cursor=${cursorForNewest}`)
        .expect(400);
    });

    it('paginates stably across >= 2 pages for all sorts with ties without skips or duplicates', async () => {
      // Create 5 listings with ties in price, expiresAt, and creation time
      const prices = [1000, 2000, 2000, 3000, 4000];
      const createdListings = [];

      for (let i = 0; i < 5; i++) {
        const item = await prisma.listing.create({
          data: {
            ownerId: user1Id,
            categoryId,
            kind: i % 2 === 0 ? 'REQUEST' : 'OFFER',
            status: 'OPEN',
            title: `Item ${i + 1}`,
            description: 'A sufficiently long description for testing',
            priceType: 'FIXED',
            priceMinCents: prices[i],
            createdAt: new Date(Date.now() + i * 1000),
          },
        });
        createdListings.push(item);
      }

      // Test sorts: newest, price_asc, price_desc
      const sorts = ['newest', 'price_asc', 'price_desc'] as const;

      for (const sort of sorts) {
        // Page 1 (limit=2)
        const p1 = await request(server).get(`/api/v1/listings?sort=${sort}&limit=2`).expect(200);

        expect(p1.body.items).toHaveLength(2);
        expect(p1.body.nextCursor).toBeDefined();

        // Page 2 (limit=2)
        const p2 = await request(server)
          .get(`/api/v1/listings?sort=${sort}&limit=2&cursor=${p1.body.nextCursor}`)
          .expect(200);

        expect(p2.body.items).toHaveLength(2);
        expect(p2.body.nextCursor).toBeDefined();

        // Page 3 (limit=2)
        const p3 = await request(server)
          .get(`/api/v1/listings?sort=${sort}&limit=2&cursor=${p2.body.nextCursor}`)
          .expect(200);

        expect(p3.body.items).toHaveLength(1);
        expect(p3.body.nextCursor).toBeNull();

        // Check no duplicates and no skips
        const b1 = p1.body as { items: Array<{ id: string }> };
        const b2 = p2.body as { items: Array<{ id: string }> };
        const b3 = p3.body as { items: Array<{ id: string }> };
        const allIds = [
          ...b1.items.map((it) => it.id),
          ...b2.items.map((it) => it.id),
          ...b3.items.map((it) => it.id),
        ];

        expect(new Set(allIds).size).toBe(5);
      }
    });

    it('paginates stably for ending_soon with a mix of NULL and non-NULL expiresAt and ties', async () => {
      const now = Date.now();
      // 5 listings: 2 with non-null tied expiresAt, 1 distinct non-null, 2 with NULL expiresAt
      const expires = [
        new Date(now + 100000), // +100s
        new Date(now + 200000), // +200s (tied with next)
        new Date(now + 200000), // +200s (tied with previous)
        null, // null (tied with next)
        null, // null (tied with previous)
      ];

      for (let i = 0; i < 5; i++) {
        await prisma.listing.create({
          data: {
            ownerId: user1Id,
            categoryId,
            kind: 'REQUEST',
            status: 'OPEN',
            title: `Ending Item ${i + 1}`,
            description: 'A sufficiently long description for testing ending_soon',
            priceType: 'NEGOTIABLE',
            expiresAt: expires[i],
          },
        });
      }

      // Page 1 (limit=2)
      const p1 = await request(server).get('/api/v1/listings?sort=ending_soon&limit=2').expect(200);
      expect(p1.body.items).toHaveLength(2);
      expect(p1.body.nextCursor).toBeDefined();

      // Page 2 (limit=2)
      const p2 = await request(server)
        .get(`/api/v1/listings?sort=ending_soon&limit=2&cursor=${p1.body.nextCursor}`)
        .expect(200);
      expect(p2.body.items).toHaveLength(2);
      expect(p2.body.nextCursor).toBeDefined();

      // Page 3 (limit=2)
      const p3 = await request(server)
        .get(`/api/v1/listings?sort=ending_soon&limit=2&cursor=${p2.body.nextCursor}`)
        .expect(200);
      expect(p3.body.items).toHaveLength(1);
      expect(p3.body.nextCursor).toBeNull();

      const b1Ending = p1.body as { items: Array<{ id: string }> };
      const b2Ending = p2.body as { items: Array<{ id: string }> };
      const b3Ending = p3.body as { items: Array<{ id: string }> };
      const allIds = [
        ...b1Ending.items.map((it) => it.id),
        ...b2Ending.items.map((it) => it.id),
        ...b3Ending.items.map((it) => it.id),
      ];
      expect(new Set(allIds).size).toBe(5);
    });

    it('paginates stably for most_bids with equal bid counts and ties across pages', async () => {
      // Create 5 listings with tied bid counts: 3 bids, 2 bids (tied), 2 bids (tied), 0 bids (tied), 0 bids (tied)
      const listings = [];
      for (let i = 0; i < 5; i++) {
        const item = await prisma.listing.create({
          data: {
            ownerId: user1Id,
            categoryId,
            kind: 'REQUEST',
            status: 'OPEN',
            title: `Bid Item ${i + 1}`,
            description: 'A sufficiently long description for testing most_bids',
            priceType: 'NEGOTIABLE',
          },
        });
        listings.push(item);
      }

      // Add bids: item 0 gets 3 bids, items 1 & 2 get 2 bids each, items 3 & 4 get 0 bids
      const bidCounts = [3, 2, 2, 0, 0];
      for (let i = 0; i < 5; i++) {
        const count = bidCounts[i] ?? 0;
        const targetListing = listings[i]!;
        for (let b = 0; b < count; b++) {
          await prisma.bid.create({
            data: {
              listingId: targetListing.id,
              bidderId: user2Id,
              amountCents: 1000 + b * 100,
              currency: 'USD',
              deliveryDays: 3,
              message: `Bid ${b} on item ${i}`,
              status: 'PENDING',
            },
          });
        }
      }

      // Page 1 (limit=2)
      const p1 = await request(server).get('/api/v1/listings?sort=most_bids&limit=2').expect(200);
      expect(p1.body.items).toHaveLength(2);
      expect(p1.body.items[0].bidCount).toBe(3);
      expect(p1.body.items[1].bidCount).toBe(2);
      expect(p1.body.nextCursor).toBeDefined();

      // Page 2 (limit=2)
      const p2 = await request(server)
        .get(`/api/v1/listings?sort=most_bids&limit=2&cursor=${p1.body.nextCursor}`)
        .expect(200);
      expect(p2.body.items).toHaveLength(2);
      expect(p2.body.items[0].bidCount).toBe(2);
      expect(p2.body.items[1].bidCount).toBe(0);
      expect(p2.body.nextCursor).toBeDefined();

      // Page 3 (limit=2)
      const p3 = await request(server)
        .get(`/api/v1/listings?sort=most_bids&limit=2&cursor=${p2.body.nextCursor}`)
        .expect(200);
      expect(p3.body.items).toHaveLength(1);
      expect(p3.body.items[0].bidCount).toBe(0);
      expect(p3.body.nextCursor).toBeNull();

      const b1Bids = p1.body as { items: Array<{ id: string }> };
      const b2Bids = p2.body as { items: Array<{ id: string }> };
      const b3Bids = p3.body as { items: Array<{ id: string }> };
      const allIds = [
        ...b1Bids.items.map((it) => it.id),
        ...b2Bids.items.map((it) => it.id),
        ...b3Bids.items.map((it) => it.id),
      ];
      expect(new Set(allIds).size).toBe(5);
    });

    it('paginates stably for relevance with tied ranks across pages (Finding 1 fix)', async () => {
      // Create 3 listings with identical rank for search term 'design'
      const l1 = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Design Specialist Alpha',
          description: 'Top notch design service for clients',
          priceType: 'NEGOTIABLE',
        },
      });
      const l2 = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Design Specialist Beta',
          description: 'Top notch design service for clients',
          priceType: 'NEGOTIABLE',
        },
      });
      const l3 = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Design Specialist Gamma',
          description: 'Top notch design service for clients',
          priceType: 'NEGOTIABLE',
        },
      });

      // Page 1 (limit=2)
      const p1 = await request(server)
        .get('/api/v1/listings?q=design&sort=relevance&limit=2')
        .expect(200);

      expect(p1.body.items).toHaveLength(2);
      expect(p1.body.nextCursor).toBeDefined();

      // Page 2 (limit=2) - must return the 3rd item with tied rank, NOT skip it
      const p2 = await request(server)
        .get(`/api/v1/listings?q=design&sort=relevance&limit=2&cursor=${p1.body.nextCursor}`)
        .expect(200);

      expect(p2.body.items).toHaveLength(1);
      expect(p2.body.nextCursor).toBeNull();

      const b1Rel = p1.body as { items: Array<{ id: string }> };
      const b2Rel = p2.body as { items: Array<{ id: string }> };
      const returnedIds = [...b1Rel.items.map((it) => it.id), ...b2Rel.items.map((it) => it.id)];
      expect(new Set(returnedIds).size).toBe(3);
      expect(returnedIds).toContain(l1.id);
      expect(returnedIds).toContain(l2.id);
      expect(returnedIds).toContain(l3.id);
    });
  });
});
