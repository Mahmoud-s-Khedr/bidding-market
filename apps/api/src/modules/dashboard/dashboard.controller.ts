import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { DashboardService } from './dashboard.service.js';
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get('summary') summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user.id);
  }
}
