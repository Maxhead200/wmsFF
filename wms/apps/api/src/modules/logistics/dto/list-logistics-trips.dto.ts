import { LogisticsTripStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListLogisticsTripsDto {
  @IsOptional()
  @IsString()
  carrierId?: string;

  @IsOptional()
  @IsEnum(LogisticsTripStatus)
  status?: LogisticsTripStatus;
}
