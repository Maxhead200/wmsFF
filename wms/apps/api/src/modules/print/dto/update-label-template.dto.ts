import { LabelTemplateType } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class UpdateLabelTemplateDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]+$/)
  code?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(LabelTemplateType)
  type?: LabelTemplateType;

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

  @IsOptional()
  @IsString()
  tspl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  changeReason?: string;
}
