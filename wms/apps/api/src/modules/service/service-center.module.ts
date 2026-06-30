import { Module } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { ServiceCenterController } from './service-center.controller';
import { ServiceCenterService } from './service-center.service';

@Module({
  controllers: [ServiceCenterController],
  providers: [ServiceCenterService, PasswordService],
})
export class ServiceCenterModule {}
