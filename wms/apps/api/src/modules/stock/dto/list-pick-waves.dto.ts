import { PickWaveStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListPickWavesDto {
  @IsOptional()
  @IsEnum(PickWaveStatus)
  status?: PickWaveStatus;
}

