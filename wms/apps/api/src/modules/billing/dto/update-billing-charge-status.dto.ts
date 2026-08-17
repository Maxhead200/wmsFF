import { BillingChargeStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateBillingChargeStatusDto {
  @IsEnum(BillingChargeStatus)
  status!: BillingChargeStatus;
}
