import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PreviewPalletLabelDto {
  @IsString()
  palletCode!: string;

  @IsString()
  clientName!: string;

  @IsOptional()
  @IsString()
  zoneCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  boxesCount?: number;
}
