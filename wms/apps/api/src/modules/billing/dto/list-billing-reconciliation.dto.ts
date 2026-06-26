import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListBillingReconciliationDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;
}
