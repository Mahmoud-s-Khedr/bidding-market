import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module.js';
import { UsersModule } from '../users/users.module.js';
import { ListingsModule } from '../listings/listings.module.js';
import { CategoriesModule } from '../categories/categories.module.js';
import { BidsController, ListingBidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';

@Module({
  imports: [StorageModule, UsersModule, ListingsModule, CategoriesModule],
  controllers: [ListingBidsController, BidsController],
  providers: [BidsService],
  exports: [BidsService],
})
export class BidsModule {}
