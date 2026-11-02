import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { UserPresenter } from './user.presenter.js';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService, UserPresenter],
  exports: [UsersService, UserPresenter],
})
export class UsersModule {}
