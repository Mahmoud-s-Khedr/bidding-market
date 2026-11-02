import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/common/configure-app.js';
import { parseEnv } from '../../src/common/env.js';
export async function createTestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureApp(app, parseEnv(process.env));
  await app.init();
  return app;
}
