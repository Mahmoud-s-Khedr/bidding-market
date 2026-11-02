import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
describe('health', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());
  it('checks db and redis', async () => {
    expect((await request(app.getHttpServer()).get('/health').expect(200)).body).toEqual({
      status: 'ok',
      db: 'ok',
      redis: 'ok',
    });
  });
});
