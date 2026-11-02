import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/app.js';
describe('boot', () => {
  it('boots and serves health', async () => {
    const app = await createTestApp();
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    await app.close();
  });
});
