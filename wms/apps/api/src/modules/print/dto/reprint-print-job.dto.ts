import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReprintPrintJobDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
