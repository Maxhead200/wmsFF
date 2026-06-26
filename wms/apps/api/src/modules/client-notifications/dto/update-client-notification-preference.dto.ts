import { ClientNotificationEvent } from '@prisma/client';
import { IsBoolean, IsEnum, IsString } from 'class-validator';

export class UpdateClientNotificationPreferenceDto {
  @IsString()
  clientId!: string;

  @IsEnum(ClientNotificationEvent)
  eventType!: ClientNotificationEvent;

  @IsBoolean()
  isEnabled!: boolean;
}
