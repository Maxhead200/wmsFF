import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class FinalizeDeliveryQuoteDto {
  @IsNumber()
  @Min(0.01)
  estimatedTotalRub!: number;

  @IsOptional()
  @IsString()
  managerComment?: string;
}
