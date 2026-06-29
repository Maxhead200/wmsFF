import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateTsdDeviceDto } from './dto/create-tsd-device.dto';
import { LoginTsdDeviceDto } from './dto/login-tsd-device.dto';
import { TsdDeviceService } from './tsd-device.service';

@ApiTags('tsd')
@Controller('tsd')
export class TsdDeviceController {
  constructor(private readonly devices: TsdDeviceService) {}

  @Get('devices')
  @ApiBearerAuth()
  @RequirePermissions('users:read')
  listDevices() {
    return this.devices.listDevices();
  }

  @Get('devices/settings')
  @ApiBearerAuth()
  @RequirePermissions('users:read')
  getDeviceSettings() {
    return this.devices.getDeviceSettings();
  }

  @Patch('devices/settings')
  @ApiBearerAuth()
  @RequirePermissions('system:admin')
  updateDeviceSettings(@Body() dto: { maxActiveDevices?: number }, @CurrentUser() user: AuthUser) {
    return this.devices.updateDeviceSettings(dto, user);
  }

  @Post('devices')
  @ApiBearerAuth()
  @RequirePermissions('users:write')
  createDevice(@Body() dto: CreateTsdDeviceDto) {
    return this.devices.createDevice(dto);
  }

  @Post('login')
  @Public()
  login(@Body() dto: LoginTsdDeviceDto) {
    return this.devices.login(dto);
  }
}
