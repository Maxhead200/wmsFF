import { LogisticsTripStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateLogisticsTripStatusDto {
  @IsEnum(LogisticsTripStatus)
  status!: LogisticsTripStatus;

  @IsOptional()
  @IsString()
  comment?: string;
}
