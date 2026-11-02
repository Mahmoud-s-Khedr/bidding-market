import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  idParamSchema,
  type CategoryCreateInput,
  type CategoryUpdateInput,
} from '@market/shared';
import { Public, Roles } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { RolesGuard } from '../auth/auth.guard.js';
import { CategoriesService } from './categories.service.js';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Public()
  getTree() {
    return this.categories.getTree();
  }
}

@Controller('admin/categories')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminCategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  create(@Body(new ZodValidationPipe(categoryCreateSchema)) body: unknown) {
    return this.categories.create(body as CategoryCreateInput);
  }

  @Patch(':id')
  update(
    @Param(new ZodValidationPipe(idParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(categoryUpdateSchema)) body: unknown,
  ) {
    const p = params as { id: string };
    return this.categories.update(p.id, body as CategoryUpdateInput);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param(new ZodValidationPipe(idParamSchema)) params: unknown) {
    const p = params as { id: string };
    return this.categories.delete(p.id);
  }
}
