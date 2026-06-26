import { ClientNotificationSeverity } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientNotificationDto {
  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  body?: string;

  @IsOptional()
  @IsEnum(ClientNotificationSeverity)
  severity?: ClientNotificationSeverity;
}
