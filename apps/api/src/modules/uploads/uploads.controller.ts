import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { idParamSchema, presignUploadSchema, type UploadPresignInput } from '@market/shared';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { UploadsService } from './uploads.service.js';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('presign')
  presign(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(presignUploadSchema)) body: unknown,
  ) {
    return this.uploads.presign(user.id, body as UploadPresignInput);
  }

  @Post(':id/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.uploads.complete(user.id, p.id);
  }

  @Get(':id/url')
  getUrl(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.uploads.getUrl(user, p.id);
  }
}
