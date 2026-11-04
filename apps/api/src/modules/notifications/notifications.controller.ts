import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  idParamSchema,
  notificationQuerySchema,
  type NotificationQueryInput,
} from '@market/shared';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { NotificationsService } from './notifications.service.js';
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(notificationQuerySchema)) query: unknown,
  ) {
    return this.notifications.list(user.id, query as NotificationQueryInput);
  }
  @Get('unread-count') unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user.id);
  }
  @Post(':id/read') async read(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    await this.notifications.read(user.id, (params as { id: string }).id);
    return { ok: true };
  }
  @Post('read-all') async readAll(@CurrentUser() user: AuthUser, @Body() _body: unknown) {
    await this.notifications.readAll(user.id);
    return { ok: true };
  }
}
