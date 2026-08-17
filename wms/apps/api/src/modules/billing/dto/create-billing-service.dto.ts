import { BillingUnit } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBillingServiceDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsEnum(BillingUnit)
  unit?: BillingUnit;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultPriceRub?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
