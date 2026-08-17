import { IsObject, IsOptional } from 'class-validator';

export class PreviewLabelTemplateDto {
  @IsOptional()
  @IsObject()
  variables?: Record<string, string | number | boolean | null>;
}
