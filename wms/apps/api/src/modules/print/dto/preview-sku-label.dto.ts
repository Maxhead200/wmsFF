import { IsOptional, IsString } from 'class-validator';

export class PreviewSkuLabelDto {
  @IsString()
  skuCode!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  article?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;
}
