import { BillingInvoiceStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateBillingInvoiceStatusDto {
  @IsEnum(BillingInvoiceStatus)
  status!: BillingInvoiceStatus;
}
