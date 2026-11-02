import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { createAdmin, createUser, signToken } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';

describe('Uploads endpoints', () => {
  let app: INestApplication;
  let server: Server;
  let adminToken: string;
  let user1Token: string;
  let user1Id: string;
  let user2Token: string;

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
    adminToken = signToken(app, { id: admin.id, role: 'ADMIN' });
    user1Token = signToken(app, { id: u1.id, role: 'USER' });
    user2Token = signToken(app, { id: u2.id, role: 'USER' });
  });

  describe('POST /api/v1/uploads/presign', () => {
    it('creates PENDING upload and returns presigned PUT URL and headers', async () => {
      const res = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_IMAGE',
          fileName: 'my profile picture (1).png',
          mimeType: 'image/png',
          sizeBytes: 1024,
        })
        .expect(201);

      expect(res.body.uploadId).toBeDefined();
      expect(res.body.url).toContain('http');
      expect(res.body.headers).toEqual({ 'content-type': 'image/png' });
      expect(res.body.key).toMatch(
        /^listing_image\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/my_profile_picture_1_\.png$/,
      );
      expect(res.body.expiresAt).toBeDefined();

      const inDb = await prisma.upload.findUnique({ where: { id: res.body.uploadId } });
      expect(inDb).toBeDefined();
      expect(inDb?.status).toBe('PENDING');
      expect(inDb?.uploaderId).toBe(user1Id);
    });

    it('returns 400 when mimeType is not allowed for purpose', async () => {
      await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_IMAGE',
          fileName: 'file.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(400);
    });

    it('returns 400 when size exceeds purpose max limit', async () => {
      await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'AVATAR',
          fileName: 'large.png',
          mimeType: 'image/png',
          sizeBytes: 10_000_001,
        })
        .expect(400);
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server)
        .post('/api/v1/uploads/presign')
        .send({
          purpose: 'LISTING_IMAGE',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 500,
        })
        .expect(401);
    });
  });

  describe('POST /api/v1/uploads/:id/complete', () => {
    it('successfully completes upload after real S3 PUT and returns Attachment', async () => {
      const fileContent = 'hello real s3 upload test content';
      const sizeBytes = Buffer.byteLength(fileContent);

      const presignRes = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_ATTACHMENT',
          fileName: 'readme.txt',
          mimeType: 'text/plain',
          sizeBytes,
        })
        .expect(201);

      const putUrl = presignRes.body.url;
      const uploadId = presignRes.body.uploadId;

      // Real PUT to S3 / SeaweedFS
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: fileContent,
      });
      expect(putRes.ok).toBe(true);

      // Complete upload
      const completeRes = await request(server)
        .post(`/api/v1/uploads/${uploadId}/complete`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(201);

      expect(completeRes.body.id).toBe(uploadId);
      expect(completeRes.body.key).toBe(presignRes.body.key);
      expect(completeRes.body.fileName).toBe('readme.txt');
      expect(completeRes.body.mimeType).toBe('text/plain');
      expect(completeRes.body.sizeBytes).toBe(sizeBytes);
      expect(completeRes.body.url).toBeDefined();

      const inDb = await prisma.upload.findUnique({ where: { id: uploadId } });
      expect(inDb?.status).toBe('READY');
      expect(inDb?.completedAt).not.toBeNull();
    });

    it('returns 400 when uploaded size does not match presigned size', async () => {
      const presignRes = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_ATTACHMENT',
          fileName: 'readme.txt',
          mimeType: 'text/plain',
          sizeBytes: 500, // presigned 500 bytes
        })
        .expect(201);

      // Upload only 5 bytes
      await fetch(presignRes.body.url, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: '12345',
      });

      await request(server)
        .post(`/api/v1/uploads/${presignRes.body.uploadId}/complete`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(400);
    });

    it('returns 400 when complete is called without uploading object to S3', async () => {
      const presignRes = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_ATTACHMENT',
          fileName: 'missing.txt',
          mimeType: 'text/plain',
          sizeBytes: 100,
        })
        .expect(201);

      await request(server)
        .post(`/api/v1/uploads/${presignRes.body.uploadId}/complete`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(400);
    });

    it('returns 403 when user is not the uploader', async () => {
      const presignRes = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_ATTACHMENT',
          fileName: 'readme.txt',
          mimeType: 'text/plain',
          sizeBytes: 10,
        })
        .expect(201);

      await request(server)
        .post(`/api/v1/uploads/${presignRes.body.uploadId}/complete`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);
    });

    it('returns 404 when upload does not exist', async () => {
      await request(server)
        .post('/api/v1/uploads/missing-id/complete')
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/uploads/:id/url', () => {
    it('authorizes uploader to get presigned GET URL', async () => {
      const presignRes = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_ATTACHMENT',
          fileName: 'readme.txt',
          mimeType: 'text/plain',
          sizeBytes: 5,
        })
        .expect(201);

      await fetch(presignRes.body.url, {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: 'hello',
      });

      await request(server)
        .post(`/api/v1/uploads/${presignRes.body.uploadId}/complete`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(201);

      const urlRes = await request(server)
        .get(`/api/v1/uploads/${presignRes.body.uploadId}/url`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);

      expect(urlRes.body.url).toContain('http');
      expect(urlRes.body.expiresAt).toBeDefined();

      // Fetch from signed GET URL
      const fileRes = await fetch(urlRes.body.url);
      expect(await fileRes.text()).toBe('hello');
    });

    it('authorizes admin to get URL for any upload', async () => {
      const presignRes = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_ATTACHMENT',
          fileName: 'readme.txt',
          mimeType: 'text/plain',
          sizeBytes: 5,
        })
        .expect(201);

      await request(server)
        .get(`/api/v1/uploads/${presignRes.body.uploadId}/url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('authorizes other user when upload is attached to a public listing', async () => {
      const presignRes = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_ATTACHMENT',
          fileName: 'spec.txt',
          mimeType: 'text/plain',
          sizeBytes: 10,
        })
        .expect(201);

      await prisma.upload.update({
        where: { id: presignRes.body.uploadId },
        data: { status: 'READY' },
      });

      const cat = await prisma.category.create({
        data: { name: 'Cat', slug: 'cat-uploads' },
      });

      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId: cat.id,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Public listing with attachment',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 1000,
        },
      });

      await prisma.listingAttachment.create({
        data: { listingId: listing.id, uploadId: presignRes.body.uploadId },
      });

      // user2 requests url
      await request(server)
        .get(`/api/v1/uploads/${presignRes.body.uploadId}/url`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(200);
    });

    it('returns 404 for other user when upload is unattached or attached to a DRAFT listing', async () => {
      const presignRes = await request(server)
        .post('/api/v1/uploads/presign')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          purpose: 'LISTING_ATTACHMENT',
          fileName: 'draft.txt',
          mimeType: 'text/plain',
          sizeBytes: 10,
        })
        .expect(201);

      await prisma.upload.update({
        where: { id: presignRes.body.uploadId },
        data: { status: 'READY' },
      });

      const cat = await prisma.category.create({
        data: { name: 'Cat Draft', slug: 'cat-draft' },
      });

      const listing = await prisma.listing.create({
        data: {
          ownerId: user1Id,
          categoryId: cat.id,
          kind: 'REQUEST',
          status: 'DRAFT',
          title: 'Draft listing with attachment',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 1000,
        },
      });

      await prisma.listingAttachment.create({
        data: { listingId: listing.id, uploadId: presignRes.body.uploadId },
      });

      // user2 requests url -> 404 (does not leak existence)
      await request(server)
        .get(`/api/v1/uploads/${presignRes.body.uploadId}/url`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(404);
    });
  });
});
