import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
import { resetDb, prisma } from './helpers/db.js';
import { userInput } from './helpers/factories.js';
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
    expect(registered.body.accessToken).toEqual(expect.any(String));
    expect(registered.headers['set-cookie']?.[0]).toContain('HttpOnly');
    expect(registered.headers['set-cookie']?.[0]).toContain('Path=/api/v1/auth');
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
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${registered.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(input.email);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
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
});
