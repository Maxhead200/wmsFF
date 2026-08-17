import { LabelTemplateType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateLabelTemplateDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]+$/)
  code!: string;

  @IsString()
  name!: string;

  @IsEnum(LabelTemplateType)
  type!: LabelTemplateType;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(150)
  widthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(150)
  heightMm?: number;

  @IsString()
  tspl!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
