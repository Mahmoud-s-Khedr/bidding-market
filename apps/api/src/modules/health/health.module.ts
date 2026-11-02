import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { HealthController } from './health.controller.js';
@Module({
  controllers: [HealthController],
  providers: [{ provide: Redis, useFactory: () => new Redis(process.env.REDIS_URL ?? '') }],
  exports: [Redis],
})
export class HealthModule {}
