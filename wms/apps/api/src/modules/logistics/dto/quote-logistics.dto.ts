import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class QuoteLogisticsDto {
  @IsOptional()
  @IsString()
  tariffSetId?: string;

  @IsString()
  destination!: string;

  @ValidateIf((dto: QuoteLogisticsDto) => dto.boxes == null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pallets?: number;

  @ValidateIf((dto: QuoteLogisticsDto) => dto.pallets == null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  boxes?: number;

  @IsOptional()
  @IsDateString()
  quoteDate?: string;
}
