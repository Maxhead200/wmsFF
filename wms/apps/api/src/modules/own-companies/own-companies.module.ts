import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { OwnCompaniesController } from './own-companies.controller';
import { OwnCompaniesService } from './own-companies.service';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [OwnCompaniesController],
  providers: [OwnCompaniesService],
  exports: [OwnCompaniesService],
})
export class OwnCompaniesModule {}
