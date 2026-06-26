import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { AuthModule } from '../auth/auth.module';
import { BillingDocumentService } from './billing-document.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuthModule, CommonModule],
  controllers: [BillingController],
  providers: [BillingService, BillingDocumentService],
})
export class BillingModule {}
