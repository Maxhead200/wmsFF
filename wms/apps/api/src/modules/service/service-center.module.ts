import { Module } from '@nestjs/common';
import { ClientNotificationsModule } from '../client-notifications/client-notifications.module';
import { ServiceCenterController } from './service-center.controller';
import { ServiceCenterService } from './service-center.service';

@Module({
  imports: [ClientNotificationsModule],
  controllers: [ServiceCenterController],
  providers: [ServiceCenterService],
})
export class ServiceCenterModule {}
