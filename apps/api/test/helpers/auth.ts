import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as argon2 from 'argon2';
import { expect } from 'vitest';
import { prisma } from './db.js';

export function assertNoPasswordHash(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') {
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      assertNoPasswordHash(item);
    }
    return;
  }
  const record = obj as Record<string, unknown>;
  expect(record).not.toHaveProperty('passwordHash');
  for (const value of Object.values(record)) {
    assertNoPasswordHash(value);
  }
}
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
export async function loginAs(app: INestApplication, email: string, password = 'Password123!') {
  const server = app.getHttpServer() as Server;
  const response = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);
  return {
    accessToken: response.body.accessToken as string,
    cookie: response.headers['set-cookie']?.[0] as string,
    user: response.body.user as { id: string; role: 'USER' | 'ADMIN' },
  };
}
export function signToken(
  app: INestApplication,
  user: { id: string; role: 'USER' | 'ADMIN' },
): string {
  return app.get(JwtService).sign({ sub: user.id, role: user.role });
}
export async function createUser(
  options: {
    email?: string;
    role?: 'USER' | 'ADMIN';
    status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
    password?: string;
  } = {},
) {
  const password = options.password ?? 'Password123!';
  return prisma.user.create({
    data: {
      email: options.email ?? `user-${crypto.randomUUID()}@test.local`,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      displayName: 'Test User',
      role: options.role ?? 'USER',
      status: options.status ?? 'ACTIVE',
    },
  });
}
export const createAdmin = (email?: string) => createUser({ email, role: 'ADMIN' });
