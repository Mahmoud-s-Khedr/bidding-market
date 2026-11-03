import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { createAdmin, createUser, signToken } from './helpers/auth.js';
import { resetDb } from './helpers/db.js';

describe('Admin endpoint authorization', () => {
  let app: INestApplication;
  let server: Server;
  let adminToken: string;
  let userToken: string;
  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer() as Server;
  });
  afterAll(async () => app.close());
  beforeEach(async () => {
    await resetDb();
    const admin = await createAdmin();
    const user = await createUser();
    adminToken = signToken(app, { id: admin.id, role: 'ADMIN' });
    userToken = signToken(app, { id: user.id, role: 'USER' });
  });
  it.each(['/stats', '/users', '/listings', '/reports', '/audit-log'])(
    'returns 401 for unauthenticated GET %s',
    async (path) => {
      await request(server).get(`/api/v1/admin${path}`).expect(401);
    },
  );
  it.each(['/stats', '/users', '/listings', '/reports', '/audit-log'])(
    'returns 403 for a non-admin GET %s',
    async (path) => {
      await request(server)
        .get(`/api/v1/admin${path}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    },
  );
  it('validates pagination', async () => {
    await request(server)
      .get('/api/v1/admin/users?limit=0')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
  it('lists an empty audit log', async () => {
    const result = await request(server)
      .get('/api/v1/admin/audit-log')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(result.body).toEqual({ items: [], nextCursor: null });
  });
});
