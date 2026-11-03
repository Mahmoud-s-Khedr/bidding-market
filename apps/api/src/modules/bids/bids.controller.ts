import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  bidCounterSchema,
  bidCreateSchema,
  bidQuerySchema,
  bidRejectSchema,
  bidUpdateSchema,
  idParamSchema,
  myBidsQuerySchema,
  type BidCounterInput,
  type BidCreateInput,
  type BidQueryInput,
  type BidRejectInput,
  type BidUpdateInput,
  type MyBidsQueryInput,
} from '@market/shared';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { BidsService } from './bids.service.js';

@Controller('listings/:id/bids')
export class ListingBidsController {
  constructor(private readonly bids: BidsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(bidCreateSchema)) body: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.create(p.id, body as BidCreateInput, user);
  }

  @Get()
  findByListing(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Query(new ZodValidationPipe(bidQuerySchema)) query: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.findByListing(p.id, query as BidQueryInput, user);
  }
}

@Controller('bids')
export class BidsController {
  constructor(private readonly bids: BidsService) {}

  @Get('mine')
  findMine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(myBidsQuerySchema)) query: unknown,
  ) {
    return this.bids.findMine(query as MyBidsQueryInput, user);
  }

  @Get(':id')
  findById(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.findById(p.id, user);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(bidUpdateSchema)) body: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.update(p.id, body as BidUpdateInput, user);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.withdraw(p.id, user);
  }

  @Post(':id/shortlist')
  @HttpCode(200)
  shortlist(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.shortlist(p.id, user);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(bidRejectSchema)) body: unknown,
  ) {
    const p = params as { id: string };
    const b = (body as BidRejectInput | undefined) ?? {};
    return this.bids.reject(p.id, b, user);
  }

  @Post(':id/counter')
  @HttpCode(200)
  counter(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(bidCounterSchema)) body: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.counter(p.id, body as BidCounterInput, user);
  }

  @Post(':id/accept-counter')
  @HttpCode(200)
  acceptCounter(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.acceptCounter(p.id, user);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    const p = params as { id: string };
    return this.bids.accept(p.id, user);
  }
}
