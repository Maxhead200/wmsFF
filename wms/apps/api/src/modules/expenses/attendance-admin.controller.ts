import { Body, Controller, Get, Headers, Ip, Param, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AttendanceDeviceService } from './attendance-device.service';
import { payrollWarehouses } from './payroll.service';

// FIX: Administrative endpoints retain WMS permissions and branch scope.
@Controller('expenses/workforce/attendance')
@RequirePermissions('expenses:read')
export class AttendanceAdminController {
  constructor(private readonly service: AttendanceDeviceService) {}
  @Get('capabilities') capabilities(@CurrentUser() user: AuthUser) { payrollWarehouses(user); return { enabled: this.service.enabled() }; }
  @Get('devices') devices(@CurrentUser() user: AuthUser) { return this.service.devices(user); }
  @Post('codes') @RequirePermissions('expenses:write')
  code(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) { return this.service.issue(user, body.warehouseId); }
  @Post('devices/:id/revoke') @RequirePermissions('expenses:write')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.revoke(user, id); }
  @Get('events') events(@CurrentUser() user: AuthUser, @Query('employeeId') employeeId: string | undefined, @Query('from') from: string, @Query('to') to: string) { return this.service.events(user, employeeId, from, to); }
  @Post('events/:id/resolve') @RequirePermissions('expenses:write')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: Record<string, unknown>) { return this.service.resolve(user, id, body); }
  @Post('events/:id/photo') @RequirePermissions('expenses:write')
  requestPhoto(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.requestPhoto(user, id); }
  @Get('events/:id/photo')
  async photo(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const bytes = await this.service.photo(user, id);
    response.setHeader('Content-Type', 'image/jpeg'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(bytes);
  }
}
