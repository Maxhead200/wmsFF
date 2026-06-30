import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { ClientNotificationsController } from './client-notifications.controller';
import { ClientNotificationsService } from './client-notifications.service';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [ClientNotificationsController],
  providers: [ClientNotificationsService],
  exports: [ClientNotificationsService],
})
export class ClientNotificationsModule {}
