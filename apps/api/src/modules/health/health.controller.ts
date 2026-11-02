import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { Public } from '../../common/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: Redis,
  ) {}
  @Get() @Public() async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.redis.ping();
      return { status: 'ok', db: 'ok', redis: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Dependency unavailable');
    }
  }
}
