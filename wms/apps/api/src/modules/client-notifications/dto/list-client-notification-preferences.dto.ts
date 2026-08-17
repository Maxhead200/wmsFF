import { IsOptional, IsString } from 'class-validator';

export class ListClientNotificationPreferencesDto {
  @IsOptional()
  @IsString()
  clientId?: string;
}
