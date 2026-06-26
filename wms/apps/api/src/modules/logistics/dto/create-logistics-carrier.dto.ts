import { IsOptional, IsString } from 'class-validator';

export class CreateLogisticsCarrierDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
