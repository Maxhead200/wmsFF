import { TsdReviewReason } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveTsdReviewDto {
  @IsIn(['APPLY_INVENTORY_ADJUSTMENT', 'REJECT'])
  action!: 'APPLY_INVENTORY_ADJUSTMENT' | 'REJECT';

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsEnum(TsdReviewReason)
  reason?: TsdReviewReason;
}
