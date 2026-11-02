import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [CategoriesModule, UsersModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
