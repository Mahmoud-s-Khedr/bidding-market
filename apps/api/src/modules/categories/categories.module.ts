import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { AdminCategoriesController, CategoriesController } from './categories.controller.js';

@Module({
  controllers: [CategoriesController, AdminCategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
