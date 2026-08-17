import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreatePrintJobFromTemplateDto {
  @IsString()
  printerCode!: string;

  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number | boolean | null>;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  copies?: number;
}
