import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  agreementCancelSchema,
  agreementsQuerySchema,
  deliverableSchema,
  disputeSchema,
  idParamSchema,
  milestoneSchema,
  milestoneUpdateSchema,
  revisionRequestSchema,
  reviewSchema,
} from '@market/shared';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { AgreementsService } from './agreements.service.js';

@Controller('agreements')
@UseGuards(JwtAuthGuard)
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}
  @Get() list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(agreementsQuerySchema)) query: unknown,
  ) {
    return this.agreements.list(
      user.id,
      query as {
        status?: 'ACTIVE' | 'DELIVERED' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
        role?: 'buyer' | 'provider';
        cursor?: string;
        limit: number;
      },
    );
  }
  @Get(':id') detail(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    return this.agreements.detail((params as { id: string }).id, user.id);
  }
  @Post(':id/milestones') createMilestone(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(milestoneSchema)) body: unknown,
  ) {
    return this.agreements.createMilestone((params as { id: string }).id, user.id, body as never);
  }
  @Patch(':id/milestones/:mid') updateMilestone(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema.extend({ mid: idParamSchema.shape.id })))
    params: unknown,
    @Body(new ZodValidationPipe(milestoneUpdateSchema)) body: unknown,
  ) {
    const p = params as { id: string; mid: string };
    return this.agreements.updateMilestone(p.id, p.mid, user.id, body as never);
  }
  @Post(':id/deliverables') deliver(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(deliverableSchema)) body: unknown,
  ) {
    return this.agreements.submitDeliverable((params as { id: string }).id, user.id, body as never);
  }
  @Post(':id/deliverables/:did/accept') accept(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema.extend({ did: idParamSchema.shape.id })))
    params: unknown,
  ) {
    const p = params as { id: string; did: string };
    return this.agreements.resolveDeliverable(p.id, p.did, user.id);
  }
  @Post(':id/deliverables/:did/request-revision') revision(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema.extend({ did: idParamSchema.shape.id })))
    params: unknown,
    @Body(new ZodValidationPipe(revisionRequestSchema)) body: unknown,
  ) {
    const p = params as { id: string; did: string };
    return this.agreements.resolveDeliverable(
      p.id,
      p.did,
      user.id,
      (body as { note: string }).note,
    );
  }
  @Post(':id/complete') complete(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    return this.agreements.complete((params as { id: string }).id, user.id);
  }
  @Post(':id/cancel') cancel(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(agreementCancelSchema)) body: unknown,
  ) {
    return this.agreements.cancel(
      (params as { id: string }).id,
      user.id,
      (body as { reason: string }).reason,
    );
  }
  @Post(':id/dispute') dispute(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(disputeSchema)) body: unknown,
  ) {
    return this.agreements.dispute(
      (params as { id: string }).id,
      user.id,
      (body as { reason: string }).reason,
    );
  }
  @Post(':id/reviews') review(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(reviewSchema)) body: unknown,
  ) {
    return this.agreements.review(
      (params as { id: string }).id,
      user.id,
      body as { rating: number; comment?: string },
    );
  }
}
