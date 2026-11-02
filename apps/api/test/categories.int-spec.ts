import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { CategoryTreeNode } from '@market/shared';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { createAdmin, createUser, signToken } from './helpers/auth.js';
import { prisma, resetDb } from './helpers/db.js';

describe('Categories endpoints', () => {
  let app: INestApplication;
  let server: Server;
  let adminToken: string;
  let userToken: string;

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
    const user = await createUser({ email: 'user@market.test' });

    adminToken = signToken(app, { id: admin.id, role: 'ADMIN' });
    userToken = signToken(app, { id: user.id, role: 'USER' });
  });

  describe('GET /api/v1/categories', () => {
    it('returns the category tree with aggregated listingCount including descendants', async () => {
      const rootCat = await prisma.category.create({
        data: { name: 'Root', slug: 'root' },
      });
      const subCat = await prisma.category.create({
        data: { name: 'Sub', slug: 'sub', parentId: rootCat.id },
      });
      const subSubCat = await prisma.category.create({
        data: { name: 'SubSub', slug: 'subsub', parentId: subCat.id },
      });

      const user = await prisma.user.findFirstOrThrow();

      // Create 1 OPEN listing in root, 2 in sub, 3 in subSub
      await prisma.listing.create({
        data: {
          ownerId: user.id,
          categoryId: rootCat.id,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Root listing',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 1000,
        },
      });
      for (let i = 0; i < 2; i++) {
        await prisma.listing.create({
          data: {
            ownerId: user.id,
            categoryId: subCat.id,
            kind: 'REQUEST',
            status: 'OPEN',
            title: `Sub listing ${i}`,
            description: 'A sufficiently long description for testing',
            priceType: 'FIXED',
            priceMinCents: 1000,
          },
        });
      }
      for (let i = 0; i < 3; i++) {
        await prisma.listing.create({
          data: {
            ownerId: user.id,
            categoryId: subSubCat.id,
            kind: 'REQUEST',
            status: 'OPEN',
            title: `SubSub listing ${i}`,
            description: 'A sufficiently long description for testing',
            priceType: 'FIXED',
            priceMinCents: 1000,
          },
        });
      }
      // Create 1 DRAFT listing (should NOT be counted)
      await prisma.listing.create({
        data: {
          ownerId: user.id,
          categoryId: rootCat.id,
          kind: 'REQUEST',
          status: 'DRAFT',
          title: 'Draft listing',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 1000,
        },
      });

      const res = await request(server).get('/api/v1/categories').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const tree = res.body as CategoryTreeNode[];
      const rootNode = tree.find((c) => c.slug === 'root');
      expect(rootNode).toBeDefined();
      if (!rootNode) throw new Error('rootNode not found');
      // Total OPEN listings = 1 (root) + 2 (sub) + 3 (subsub) = 6
      expect(rootNode.listingCount).toBe(6);
      expect(rootNode.children).toHaveLength(1);

      const subNode = rootNode.children[0];
      if (!subNode) throw new Error('subNode not found');
      expect(subNode.slug).toBe('sub');
      // Sub count = 2 (sub) + 3 (subsub) = 5
      expect(subNode.listingCount).toBe(5);
      expect(subNode.children).toHaveLength(1);

      const subSubNode = subNode.children[0];
      if (!subSubNode) throw new Error('subSubNode not found');
      expect(subSubNode.slug).toBe('subsub');
      expect(subSubNode.listingCount).toBe(3);
      expect(subSubNode.children).toHaveLength(0);

      // Repeat request hits Redis cache
      const cachedRes = await request(server).get('/api/v1/categories').expect(200);
      expect(cachedRes.body).toEqual(res.body);
    });

    it('invalidates cache when listing is created, closed, or deleted, updating listingCount immediately', async () => {
      const catRes = await request(server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Cache Test Cat', slug: 'cache-cat' })
        .expect(201);
      const catId = catRes.body.id;

      // Prime cache
      const initial = await request(server).get('/api/v1/categories').expect(200);
      const catNode1 = (initial.body as CategoryTreeNode[]).find((c) => c.slug === 'cache-cat');
      expect(catNode1?.listingCount).toBe(0);

      // Create an OPEN listing via API
      const listing1Res = await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          categoryId: catId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'First Listing',
          description: 'A sufficiently long description for testing cache invalidation',
          priceType: 'FIXED',
          priceMinCents: 1000,
          currency: 'USD',
        })
        .expect(201);

      const afterCreate1Tree = await request(server).get('/api/v1/categories').expect(200);
      const catNode2 = (afterCreate1Tree.body as CategoryTreeNode[]).find(
        (c) => c.slug === 'cache-cat',
      );
      expect(catNode2?.listingCount).toBe(1);

      // Create a second OPEN listing
      const listing2Res = await request(server)
        .post('/api/v1/listings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          categoryId: catId,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Second Listing',
          description: 'A sufficiently long description for testing cache invalidation',
          priceType: 'FIXED',
          priceMinCents: 2000,
          currency: 'USD',
        })
        .expect(201);

      const afterCreate2Tree = await request(server).get('/api/v1/categories').expect(200);
      const catNode3 = (afterCreate2Tree.body as CategoryTreeNode[]).find(
        (c) => c.slug === 'cache-cat',
      );
      expect(catNode3?.listingCount).toBe(2);

      // Close second listing
      await request(server)
        .post(`/api/v1/listings/${listing2Res.body.id}/close`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(201);

      const afterCloseTree = await request(server).get('/api/v1/categories').expect(200);
      const catNode4 = (afterCloseTree.body as CategoryTreeNode[]).find(
        (c) => c.slug === 'cache-cat',
      );
      expect(catNode4?.listingCount).toBe(1);

      // Delete first listing
      await request(server)
        .delete(`/api/v1/listings/${listing1Res.body.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(204);

      const afterDeleteTree = await request(server).get('/api/v1/categories').expect(200);
      const catNode5 = (afterDeleteTree.body as CategoryTreeNode[]).find(
        (c) => c.slug === 'cache-cat',
      );
      expect(catNode5?.listingCount).toBe(0);
    });
  });

  describe('POST /api/v1/admin/categories', () => {
    it('creates a new category (201)', async () => {
      const res = await request(server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Technology',
          slug: 'technology',
          description: 'All tech services',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.slug).toBe('technology');
      expect(res.body.parentId).toBeNull();
    });

    it('rejects invalid inputs with 400', async () => {
      await request(server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: '', slug: 'INVALID SLUG' })
        .expect(400);
    });

    it('rejects non-existent parentId with 400', async () => {
      await request(server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Web', slug: 'web', parentId: 'nonexistent-id' })
        .expect(400);
    });

    it('returns 401 when unauthenticated', async () => {
      await request(server)
        .post('/api/v1/admin/categories')
        .send({ name: 'Web', slug: 'web' })
        .expect(401);
    });

    it('returns 403 when authenticated as non-admin', async () => {
      await request(server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Web', slug: 'web' })
        .expect(403);
    });

    it('returns 409 on duplicate slug', async () => {
      await prisma.category.create({
        data: { name: 'Existing', slug: 'existing' },
      });

      await request(server)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Another', slug: 'existing' })
        .expect(409);
    });
  });

  describe('PATCH /api/v1/admin/categories/:id', () => {
    it('updates category successfully', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Old Name', slug: 'old-slug' },
      });

      const res = await request(server)
        .patch(`/api/v1/admin/categories/${cat.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
      expect(res.body.slug).toBe('old-slug');
    });

    it('returns 404 if category not found', async () => {
      await request(server)
        .patch('/api/v1/admin/categories/missing-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Name' })
        .expect(404);
    });

    it('returns 400 if setting category as its own parent', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Self', slug: 'self' },
      });

      await request(server)
        .patch(`/api/v1/admin/categories/${cat.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ parentId: cat.id })
        .expect(400);
    });

    it('returns 400 when setting a descendant as parent (cycle prevention)', async () => {
      const rootCat = await prisma.category.create({
        data: { name: 'Root', slug: 'root-cycle' },
      });
      const subCat = await prisma.category.create({
        data: { name: 'Sub', slug: 'sub-cycle', parentId: rootCat.id },
      });
      const leafCat = await prisma.category.create({
        data: { name: 'Leaf', slug: 'leaf-cycle', parentId: subCat.id },
      });

      // Try making rootCat a child of leafCat -> cycle!
      await request(server)
        .patch(`/api/v1/admin/categories/${rootCat.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ parentId: leafCat.id })
        .expect(400);
    });

    it('returns 409 if new slug collides with existing category', async () => {
      const cat1 = await prisma.category.create({
        data: { name: 'One', slug: 'cat-one' },
      });
      const cat2 = await prisma.category.create({
        data: { name: 'Two', slug: 'cat-two' },
      });

      await request(server)
        .patch(`/api/v1/admin/categories/${cat1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ slug: cat2.slug })
        .expect(409);
    });
  });

  describe('DELETE /api/v1/admin/categories/:id', () => {
    it('deletes an empty category with 204', async () => {
      const cat = await prisma.category.create({
        data: { name: 'To Delete', slug: 'to-delete' },
      });

      await request(server)
        .delete(`/api/v1/admin/categories/${cat.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const found = await prisma.category.findUnique({ where: { id: cat.id } });
      expect(found).toBeNull();
    });

    it('returns 404 when deleting nonexistent category', async () => {
      await request(server)
        .delete('/api/v1/admin/categories/missing-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('returns 409 if category has children', async () => {
      const parent = await prisma.category.create({
        data: { name: 'Parent', slug: 'parent-cat' },
      });
      await prisma.category.create({
        data: { name: 'Child', slug: 'child-cat', parentId: parent.id },
      });

      await request(server)
        .delete(`/api/v1/admin/categories/${parent.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });

    it('returns 409 if category has listings', async () => {
      const user = await prisma.user.findFirstOrThrow();
      const cat = await prisma.category.create({
        data: { name: 'Has Listings', slug: 'has-listings' },
      });
      await prisma.listing.create({
        data: {
          ownerId: user.id,
          categoryId: cat.id,
          kind: 'REQUEST',
          status: 'OPEN',
          title: 'Listing in category',
          description: 'A sufficiently long description for testing',
          priceType: 'FIXED',
          priceMinCents: 1000,
        },
      });

      await request(server)
        .delete(`/api/v1/admin/categories/${cat.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);
    });
  });
});
