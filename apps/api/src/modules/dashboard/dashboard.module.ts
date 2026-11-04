import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';

@Module({
  imports: [AuthModule, ConversationsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
