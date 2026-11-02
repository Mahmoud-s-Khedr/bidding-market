import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
export async function registerAndLogin(
  app: INestApplication,
  email = `user-${Date.now()}@test.local`,
) {
  const server = app.getHttpServer() as Server;
  const response = await request(server)
    .post('/api/v1/auth/register')
    .send({ email, password: 'Password123!', displayName: 'Test User' })
    .expect(201);
  return {
    accessToken: response.body.accessToken as string,
    cookie: response.headers['set-cookie']?.[0] as string,
    user: response.body.user as { id: string },
  };
}
