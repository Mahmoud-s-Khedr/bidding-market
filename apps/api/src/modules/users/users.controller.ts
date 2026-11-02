import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  idParamSchema,
  paginationSchema,
  updateProfileSchema,
  type UpdateProfileInput,
} from '@market/shared';
import { CurrentUser, type AuthUser, Public } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { JwtAuthGuard } from '../auth/auth.guard.js';
import { UsersService } from './users.service.js';
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get(':id') @Public() profile(@Param(new ZodValidationPipe(idParamSchema)) params: unknown) {
    return this.users.profile((params as { id: string }).id);
  }
  @Patch('me') @UseGuards(JwtAuthGuard) update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: unknown,
  ) {
    return this.users.update(user.id, body as UpdateProfileInput);
  }
  @Get(':id/reviews') @Public() reviews(
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Query(new ZodValidationPipe(paginationSchema)) query: unknown,
  ) {
    const p = params as { id: string };
    const q = query as { cursor?: string; limit: number };
    return this.users.reviews(p.id, q.cursor, q.limit);
  }
}
