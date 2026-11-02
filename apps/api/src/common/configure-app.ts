import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger, type INestApplication } from '@nestjs/common';
import type { Env } from './env.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
export function configureApp(app: INestApplication, env: Env): void {
  app.useLogger(new Logger());
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
