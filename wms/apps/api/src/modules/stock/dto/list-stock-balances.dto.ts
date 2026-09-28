import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListStockBalancesDto {
  @IsOptional()
  @IsIn(['cabinet'])
  view?: 'cabinet';

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  skuId?: string;

  @IsOptional()
  @IsString()
  boxCode?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
