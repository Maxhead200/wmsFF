import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ManualStockReceiptDto {
  @IsString()
  clientId!: string;

  @IsString()
  barcode!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  boxCode?: string;

  @IsOptional()
  @IsString()
  sourceDocument?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
