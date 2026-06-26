import { ClientRequestStatus, ClientRequestType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListClientRequestsDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsEnum(ClientRequestStatus)
  status?: ClientRequestStatus;

  @IsOptional()
  @IsEnum(ClientRequestType)
  type?: ClientRequestType;
}
