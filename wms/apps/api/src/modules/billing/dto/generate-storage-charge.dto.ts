import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class GenerateStorageChargeDto {
  @IsString()
  clientId!: string;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPriceRub?: number;

  @IsOptional()
  @IsDateString()
  serviceDate?: string;

  @IsOptional()
  @IsBoolean()
  approve?: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}
