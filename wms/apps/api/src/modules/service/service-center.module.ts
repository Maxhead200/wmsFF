import { Module } from '@nestjs/common';
import { ServiceCenterController } from './service-center.controller';
import { ServiceCenterService } from './service-center.service';

@Module({
  controllers: [ServiceCenterController],
  providers: [ServiceCenterService],
})
export class ServiceCenterModule {}
