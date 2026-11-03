import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  agreementCancelSchema,
  agreementsQuerySchema,
  deliverableSchema,
  disputeSchema,
  idParamSchema,
  milestoneCreateSchema,
  milestoneUpdateSchema,
  revisionRequestSchema,
  reviewSchema,
  type AgreementCancelInput,
  type AgreementsQueryInput,
  type DeliverableInput,
  type DisputeInput,
  type IdParamInput,
  type MilestoneCreateInput,
  type MilestoneUpdateInput,
  type RevisionRequestInput,
  type ReviewInput,
} from '@market/shared';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { AgreementsService } from './agreements.service.js';

const milestoneParamSchema = idParamSchema.extend({ mid: idParamSchema.shape.id });
type MilestoneParamInput = { id: string; mid: string };

const deliverableParamSchema = idParamSchema.extend({ did: idParamSchema.shape.id });
type DeliverableParamInput = { id: string; did: string };

@Controller('agreements')
@UseGuards(JwtAuthGuard)
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Get() list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(agreementsQuerySchema)) query: AgreementsQueryInput,
  ) {
    return this.agreements.list(user.id, query);
  }

  @Get(':id') detail(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParamInput,
  ) {
    return this.agreements.detail(params.id, user.id);
  }

  @Post(':id/milestones') createMilestone(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParamInput,
    @Body(new ZodValidationPipe(milestoneCreateSchema)) body: MilestoneCreateInput,
  ) {
    return this.agreements.createMilestone(params.id, user.id, body);
  }

  @Patch(':id/milestones/:mid') updateMilestone(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(milestoneParamSchema))
    params: MilestoneParamInput,
    @Body(new ZodValidationPipe(milestoneUpdateSchema)) body: MilestoneUpdateInput,
  ) {
    return this.agreements.updateMilestone(params.id, params.mid, user.id, body);
  }

  @Post(':id/deliverables') deliver(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParamInput,
    @Body(new ZodValidationPipe(deliverableSchema)) body: DeliverableInput,
  ) {
    return this.agreements.submitDeliverable(params.id, user.id, body);
  }

  @Post(':id/deliverables/:did/accept') accept(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(deliverableParamSchema))
    params: DeliverableParamInput,
  ) {
    return this.agreements.resolveDeliverable(params.id, params.did, user.id);
  }

  @Post(':id/deliverables/:did/request-revision') revision(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(deliverableParamSchema))
    params: DeliverableParamInput,
    @Body(new ZodValidationPipe(revisionRequestSchema)) body: RevisionRequestInput,
  ) {
    return this.agreements.resolveDeliverable(params.id, params.did, user.id, body.note);
  }

  @Post(':id/complete') complete(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParamInput,
  ) {
    return this.agreements.complete(params.id, user.id);
  }

  @Post(':id/cancel') cancel(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParamInput,
    @Body(new ZodValidationPipe(agreementCancelSchema)) body: AgreementCancelInput,
  ) {
    return this.agreements.cancel(params.id, user.id, body.reason);
  }

  @Post(':id/dispute') dispute(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParamInput,
    @Body(new ZodValidationPipe(disputeSchema)) body: DisputeInput,
  ) {
    return this.agreements.dispute(params.id, user.id, body.reason);
  }

  @Post(':id/reviews') review(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: IdParamInput,
    @Body(new ZodValidationPipe(reviewSchema)) body: ReviewInput,
  ) {
    return this.agreements.review(params.id, user.id, body);
  }
}
