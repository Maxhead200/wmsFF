import { ClientRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateClientRequestStatusDto {
  @IsEnum(ClientRequestStatus)
  status!: ClientRequestStatus;

  @IsOptional()
  @IsString()
  managerComment?: string;
}
