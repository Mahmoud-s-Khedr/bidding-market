import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { resetDb, prisma } from './helpers/db.js';
import { userInput } from './helpers/factories.js';
import { assertNoPasswordHash } from './helpers/auth.js';
describe('auth', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(resetDb);
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  it('registers, validates and authenticates users', async () => {
    const input = userInput();
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(input)
      .expect(201);
    assertNoPasswordHash(registered.body);
    expect(registered.body.user).not.toHaveProperty('passwordHash');
    expect(registered.body.accessToken).toEqual(expect.any(String));
    expect(registered.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(registered.headers['set-cookie']?.[0]).toContain('Path=/api/v1/auth');
    expect(registered.headers['set-cookie']?.[0]).toContain('SameSite=Lax');
    expect(registered.headers['set-cookie']?.[0]).toContain('Max-Age=604800');
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(input).expect(409);
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({})
      .expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: 'wrong' })
      .expect(401);
    const loginSuccess = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(200);
    assertNoPasswordHash(loginSuccess.body);
    expect(loginSuccess.headers['set-cookie']?.[0]).toContain('Max-Age=604800');
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(200);
    assertNoPasswordHash(me.body);
    expect(me.body.email).toBe(input.email);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });
  it('rejects absent and garbage refresh tokens', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=not-a-token')
      .expect(401);
  });
  it('rotates refresh tokens and detects reuse', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userInput())
      .expect(201);
    const oldCookie = registered.headers['set-cookie']?.[0] ?? '';
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(200);
    assertNoPasswordHash(rotated.body);
    expect(rotated.headers['set-cookie']?.[0]).toContain('Max-Age=604800');
    const newCookie = rotated.headers['set-cookie']?.[0] ?? '';
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', oldCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', newCookie)
      .expect(401);
  });
  it('rejects suspended users at login and refresh', async () => {
    const input = userInput();
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(input)
      .expect(201);
    await prisma.user.update({
      where: { id: registered.body.user.id },
      data: { status: 'SUSPENDED' },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', registered.headers['set-cookie']?.[0] ?? '')
      .expect(403);
  });
  it('rejects a banned user on login', async () => {
    const input = userInput();
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(input)
      .expect(201);
    await prisma.user.update({
      where: { id: registered.body.user.id },
      data: { status: 'BANNED' },
    });
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: input.email, password: input.password })
      .expect(403);
  });
  it('rejects an access token after its user is banned', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userInput())
      .expect(201);
    await prisma.user.update({
      where: { id: registered.body.user.id },
      data: { status: 'BANNED' },
    });
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(403);
  });
  it('allows only one concurrent refresh and revokes its family', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userInput())
      .expect(201);
    const cookie = registered.headers['set-cookie']?.[0] ?? '';
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie),
      ),
    );
    expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
    const newest =
      responses.find((response) => response.status === 200)?.headers['set-cookie']?.[0] ?? '';
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', newest)
      .expect(401);
  });
  it('logs out and clears the refresh cookie', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userInput())
      .expect(201);
    const cookie = registered.headers['set-cookie']?.[0] ?? '';
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(response.headers['set-cookie']?.[0]).toContain('refresh_token=;');
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });
  it('enforces RolesGuard: non-admin gets 403 on an admin route', async () => {
    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userInput())
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .send({ name: 'Admin Cat', slug: 'admin-cat' })
      .expect(403);
  });
  it('rate limits repeated failed logins', async () => {
    const input = userInput();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(input).expect(201);
    let limited: request.Response | undefined;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: input.email, password: 'wrong' });
      if (response.status === 429) {
        limited = response;
        break;
      }
      expect(response.status).toBe(401);
    }
    expect(limited).toBeDefined();
    expect(limited?.body.error.code).toBe('RATE_LIMITED');
  });
});
