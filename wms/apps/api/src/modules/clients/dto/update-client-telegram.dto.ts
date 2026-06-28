import { IsOptional, IsString } from 'class-validator';

export class UpdateClientTelegramDto {
  @IsOptional()
  @IsString()
  telegramChatId?: string;
}
