import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateBillingPaymentDto {
  @IsString()
  invoiceId!: string;

  @IsNumber()
  @Min(0.01)
  amountRub!: number;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
