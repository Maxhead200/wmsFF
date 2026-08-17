import { BillingChargeStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListBillingChargesDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsEnum(BillingChargeStatus)
  status?: BillingChargeStatus;
}
