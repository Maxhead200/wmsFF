import { BillingPriceTaxMode } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertClientBillingServiceDto {
  @IsString()
  serviceId!: string;

  @IsNumber()
  @Min(0)
  priceRub!: number;

  @IsOptional()
  @IsEnum(BillingPriceTaxMode)
  taxMode?: BillingPriceTaxMode;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}
