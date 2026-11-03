import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';
import { ListingPresenter } from './listing.presenter.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [CategoriesModule, UsersModule, StorageModule],
  controllers: [ListingsController],
  providers: [ListingsService, ListingPresenter],
  exports: [ListingsService, ListingPresenter],
})
export class ListingsModule {}
