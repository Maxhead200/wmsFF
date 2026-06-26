import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class CreateDeliveryRequestDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @IsString()
  tariffSetId?: string;

  @IsString()
  destination!: string;

  @ValidateIf((dto: CreateDeliveryRequestDto) => dto.boxes == null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pallets?: number;

  @ValidateIf((dto: CreateDeliveryRequestDto) => dto.pallets == null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  boxes?: number;

  @IsOptional()
  @IsDateString()
  desiredShipDate?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
