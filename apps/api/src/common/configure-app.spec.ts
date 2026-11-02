import { describe, expect, it, vi } from 'vitest';
import { configureApp } from './configure-app.js';
describe('configureApp', () => {
  it('applies global setup', () => {
    const app = {
      useLogger: vi.fn(),
      use: vi.fn(),
      enableCors: vi.fn(),
      setGlobalPrefix: vi.fn(),
      useGlobalFilters: vi.fn(),
      enableShutdownHooks: vi.fn(),
    };
    configureApp(app as never, {
      WEB_ORIGIN: 'http://localhost',
      NODE_ENV: 'test',
      DATABASE_URL: 'x',
      REDIS_URL: 'x',
      JWT_ACCESS_SECRET: 'x',
      JWT_REFRESH_SECRET: 'x',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      API_PORT: 1,
      S3_ENDPOINT: 'x',
      S3_REGION: 'x',
      S3_BUCKET: 'x',
      S3_ACCESS_KEY: 'x',
      S3_SECRET_KEY: 'x',
    });
    expect(app.setGlobalPrefix).toHaveBeenCalled();
    expect(app.enableShutdownHooks).toHaveBeenCalled();
  });
});
