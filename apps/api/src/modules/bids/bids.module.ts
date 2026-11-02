import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module.js';
import { BidsController, ListingBidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';

@Module({
  imports: [StorageModule],
  controllers: [ListingBidsController, BidsController],
  providers: [BidsService],
  exports: [BidsService],
})
export class BidsModule {}
