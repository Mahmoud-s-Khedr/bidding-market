import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  adminAuditQuerySchema,
  adminListingActionSchema,
  adminListingsQuerySchema,
  adminReportsQuerySchema,
  adminResolveReportSchema,
  adminUserUpdateSchema,
  adminUsersQuerySchema,
  idParamSchema,
  reportSchema,
  type AdminAuditQueryInput,
  type AdminListingsQueryInput,
  type AdminReportsQueryInput,
  type AdminResolveReportInput,
  type AdminUserUpdateInput,
  type AdminUsersQueryInput,
  type ReportInput,
} from '@market/shared';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { RolesGuard } from '../auth/auth.guard.js';
import { AdminService, ReportsService } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(reportSchema)) body: unknown) {
    return this.reports.create(user, body as ReportInput);
  }
}

@Controller('admin')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Get('stats') stats() {
    return this.admin.stats();
  }
  @Get('users') users(@Query(new ZodValidationPipe(adminUsersQuerySchema)) query: unknown) {
    return this.admin.users(query as AdminUsersQueryInput);
  }
  @Patch('users/:id') updateUser(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(adminUserUpdateSchema)) body: unknown,
  ) {
    return this.admin.updateUser(
      user.id,
      (params as { id: string }).id,
      body as AdminUserUpdateInput,
    );
  }
  @Get('listings') listings(
    @Query(new ZodValidationPipe(adminListingsQuerySchema)) query: unknown,
  ) {
    return this.admin.listings(query as AdminListingsQueryInput);
  }
  @Post('listings/:id/remove') removeListing(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(adminListingActionSchema)) body: unknown,
  ) {
    return this.admin.removeListing(
      user.id,
      (params as { id: string }).id,
      (body as { reason: string }).reason,
    );
  }
  @Post('listings/:id/restore') restoreListing(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(adminListingActionSchema)) body: unknown,
  ) {
    return this.admin.restoreListing(
      user.id,
      (params as { id: string }).id,
      (body as { reason: string }).reason,
    );
  }
  @Get('reports') reports(@Query(new ZodValidationPipe(adminReportsQuerySchema)) query: unknown) {
    return this.admin.reports(query as AdminReportsQueryInput);
  }
  @Post('reports/:id/resolve') resolve(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(adminResolveReportSchema)) body: unknown,
  ) {
    return this.admin.resolveReport(
      user.id,
      (params as { id: string }).id,
      body as AdminResolveReportInput,
    );
  }
  @Get('audit-log') audit(
    @Query(new ZodValidationPipe(adminAuditQuerySchema))
    query: unknown,
  ) {
    return this.admin.audit(query as AdminAuditQueryInput);
  }
}
