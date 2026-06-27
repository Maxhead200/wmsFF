import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateNomenclatureItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  internalSku?: string;

  @IsOptional()
  @IsString()
  article?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsString()
  @Length(1, 300)
  name!: string;

  @IsOptional()
  @IsString()
  printName?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  itemType?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsBoolean()
  needsChestnyZnak?: boolean;
}
