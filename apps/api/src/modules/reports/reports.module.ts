import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { AdminController, ReportsController } from './reports.controller.js';
import { AdminService, ReportsService } from './reports.service.js';
import { ReportsEvents } from './reports.events.js';

@Module({
  imports: [AuthModule, CategoriesModule],
  controllers: [ReportsController, AdminController],
  providers: [ReportsService, AdminService, ReportsEvents],
})
export class ReportsModule {}
