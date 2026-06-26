import { ClientRequestPriority } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';

export class ImportOutboundRequestXlsxDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(ClientRequestPriority)
  priority?: ClientRequestPriority;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsDateString()
  desiredDate?: string;
}
