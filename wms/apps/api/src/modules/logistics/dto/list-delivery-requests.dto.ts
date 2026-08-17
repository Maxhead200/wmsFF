import { LogisticsDeliveryStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListDeliveryRequestsDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsEnum(LogisticsDeliveryStatus)
  status?: LogisticsDeliveryStatus;
}
