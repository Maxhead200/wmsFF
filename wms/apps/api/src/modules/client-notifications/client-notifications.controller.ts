import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ClientNotificationsService } from './client-notifications.service';
import { CreateClientNotificationDto } from './dto/create-client-notification.dto';
import { ListClientNotificationPreferencesDto } from './dto/list-client-notification-preferences.dto';
import { ListClientNotificationsDto } from './dto/list-client-notifications.dto';
import { UpdateClientNotificationPreferenceDto } from './dto/update-client-notification-preference.dto';

@ApiTags('client-notifications')
@RequirePermissions('client-notifications:read')
@Controller('client-notifications')
export class ClientNotificationsController {
  constructor(private readonly notifications: ClientNotificationsService) {}

  @Get()
  list(@Query() query: ListClientNotificationsDto, @CurrentUser() user: AuthUser) {
    return this.notifications.list(query, user);
  }

  @Get('preferences')
  listPreferences(@Query() query: ListClientNotificationPreferencesDto, @CurrentUser() user: AuthUser) {
    return this.notifications.listPreferences(query, user);
  }

  @Get('telegram-settings')
  getTelegramSettings(@Query('clientId') clientId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.notifications.getTelegramSettings(clientId, user);
  }

  @Patch('telegram-settings')
  updateTelegramSettings(
    @Body() dto: { clientId?: string; enabled?: boolean; chatId?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.notifications.updateTelegramSettings(dto, user);
  }

  @Patch('preferences')
  updatePreference(@Body() dto: UpdateClientNotificationPreferenceDto, @CurrentUser() user: AuthUser) {
    return this.notifications.updatePreference(dto, user);
  }

  @Post()
  @RequirePermissions('client-notifications:write')
  create(@Body() dto: CreateClientNotificationDto, @CurrentUser() user: AuthUser) {
    return this.notifications.create(dto, user);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(id, user);
  }
}
