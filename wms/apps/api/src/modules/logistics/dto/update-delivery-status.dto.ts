import { LogisticsDeliveryStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateDeliveryStatusDto {
  @IsEnum(LogisticsDeliveryStatus)
  status!: LogisticsDeliveryStatus;

  @IsOptional()
  @IsDateString()
  plannedShipDate?: string;

  @IsOptional()
  @IsString()
  managerComment?: string;
}
