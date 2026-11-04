import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  conversationCreateSchema,
  idParamSchema,
  messageCreateSchema,
  messagesQuerySchema,
  paginationSchema,
  readSchema,
  type ConversationCreateInput,
  type MessageCreateInput,
  type MessagesQueryInput,
  type PaginationInput,
} from '@market/shared';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { ConversationsService } from './conversations.service.js';
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}
  @Get() list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paginationSchema)) query: unknown,
  ) {
    return this.conversations.list(user.id, query as PaginationInput);
  }
  @Post() create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(conversationCreateSchema)) body: unknown,
  ) {
    return this.conversations.create(user, body as ConversationCreateInput);
  }
  @Get(':id') get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
  ) {
    return this.conversations.get(user.id, (params as { id: string }).id);
  }
  @Get(':id/messages') messages(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Query(new ZodValidationPipe(messagesQuerySchema)) query: unknown,
  ) {
    return this.conversations.messages(
      user.id,
      (params as { id: string }).id,
      query as MessagesQueryInput,
    );
  }
  @Post(':id/messages') send(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(messageCreateSchema)) body: unknown,
  ) {
    return this.conversations.send(
      user.id,
      (params as { id: string }).id,
      body as MessageCreateInput,
    );
  }
  @Post(':id/read') async read(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(readSchema)) body: unknown,
  ) {
    await this.conversations.read(
      user.id,
      (params as { id: string }).id,
      (body as { lastMessageId: string }).lastMessageId,
    );
    return { ok: true };
  }
}
