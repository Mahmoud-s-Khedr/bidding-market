import 'reflect-metadata';
import { config } from 'dotenv';
config({ path: '../../.env' });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseEnv } from './common/env.js';
import { configureApp } from './common/configure-app.js';
async function bootstrap(): Promise<void> {
  const env = parseEnv(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, env);
  await app.listen(env.API_PORT);
}
void bootstrap();
