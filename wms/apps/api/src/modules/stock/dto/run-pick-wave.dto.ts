import { IsOptional, IsString } from 'class-validator';

export class RunPickWaveDto {
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

