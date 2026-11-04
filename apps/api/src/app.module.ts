import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AgreementsModule } from './modules/agreements/agreements.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { AppConfigModule } from './common/config.module.js';
import { JwtAuthGuard } from './modules/auth/auth.guard.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BidsModule } from './modules/bids/bids.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { ConversationsModule } from './modules/conversations/conversations.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { StorageModule } from './storage/storage.module.js';

class HttpThrottlerGuard extends ThrottlerGuard {
  // Socket events use gateway-level validation and must not receive HTTP response headers.
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    return context.getType() === 'ws' ? true : super.canActivate(context);
  }
}

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 100 }] }),
    AuthModule,
    UsersModule,
    HealthModule,
    CategoriesModule,
    UploadsModule,
    ListingsModule,
    BidsModule,
    AgreementsModule,
    DashboardModule,
    RealtimeModule,
    ConversationsModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
