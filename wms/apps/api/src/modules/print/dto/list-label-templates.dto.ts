import { LabelTemplateType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListLabelTemplatesDto {
  @IsOptional()
  @IsEnum(LabelTemplateType)
  type?: LabelTemplateType;
}
