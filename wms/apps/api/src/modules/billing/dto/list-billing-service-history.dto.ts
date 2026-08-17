import { IsOptional, IsString } from 'class-validator';

export class ListBillingServiceHistoryDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  periodFrom?: string;

  @IsOptional()
  @IsString()
  periodTo?: string;
}
