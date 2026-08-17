import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateBillingInvoiceDto {
  @IsString()
  clientId!: string;

  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  chargeIds?: string[];

  @IsOptional()
  @IsString()
  comment?: string;
}
