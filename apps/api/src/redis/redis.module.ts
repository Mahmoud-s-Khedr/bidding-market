import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
export const REDIS = Symbol('REDIS');
@Global()
@Module({
  providers: [{ provide: REDIS, useFactory: () => new Redis(process.env.REDIS_URL ?? '') }],
  exports: [REDIS],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
