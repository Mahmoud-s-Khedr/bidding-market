import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  idParamSchema,
  listingCreateSchema,
  listingQuerySchema,
  listingUpdateSchema,
  type ListingCreateInput,
  type ListingQueryInput,
  type ListingUpdateInput,
} from '@market/shared';
import { CurrentUser, OptionalAuth, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ListingsService } from './listings.service.js';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  @OptionalAuth()
  list(
    @CurrentUser() user: AuthUser | undefined,
    @Query(new ZodValidationPipe(listingQuerySchema)) query: unknown,
  ) {
    return this.listings.list(query as ListingQueryInput, user);
  }

  @Get(':id')
  @OptionalAuth()
  getById(
    @CurrentUser() user: AuthUser | undefined,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.listings.getById(p.id, user);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(listingCreateSchema)) body: unknown,
  ) {
    return this.listings.create(user.id, body as ListingCreateInput);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(listingUpdateSchema)) body: unknown,
  ) {
    const p = params as { id: string };
    return this.listings.update(user, p.id, body as ListingUpdateInput);
  }

  @Post(':id/close')
  close(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.listings.close(user, p.id);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.listings.delete(user, p.id);
  }
}
