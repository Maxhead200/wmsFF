import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClientNotificationsController } from './client-notifications.controller';
import { ClientNotificationsService } from './client-notifications.service';

@Module({
  imports: [AuthModule],
  controllers: [ClientNotificationsController],
  providers: [ClientNotificationsService],
  exports: [ClientNotificationsService],
})
export class ClientNotificationsModule {}
