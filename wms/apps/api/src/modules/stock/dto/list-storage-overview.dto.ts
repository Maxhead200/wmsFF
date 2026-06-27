import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ListStorageOverviewDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;
}
