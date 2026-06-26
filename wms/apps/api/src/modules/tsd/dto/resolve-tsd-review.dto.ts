import { IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveTsdReviewDto {
  @IsIn(['APPLY_INVENTORY_ADJUSTMENT', 'REJECT'])
  action!: 'APPLY_INVENTORY_ADJUSTMENT' | 'REJECT';

  @IsOptional()
  @IsString()
  comment?: string;
}
