import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';
const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://a:b@localhost/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  WEB_ORIGIN: 'http://localhost:3000',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'bucket',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};
describe('parseEnv', () => {
  it('parses valid environment and defaults', () => expect(parseEnv(valid).API_PORT).toBe(4000));
  it('fails missing secrets', () =>
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: '' })).toThrow());
  it('fails malformed urls', () => expect(() => parseEnv({ ...valid, REDIS_URL: 'no' })).toThrow());
});
