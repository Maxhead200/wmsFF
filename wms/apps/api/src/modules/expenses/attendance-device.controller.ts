import { Body, Controller, Get, Headers, Ip, Param, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import type { AuthUser } from '../auth/auth.types';
import { AttendanceDeviceService } from './attendance-device.service';
import { payrollWarehouses } from './payroll.service';

// FIX: Public bypasses WMS user JWT only; every device operation checks its own scoped token.
@Public()
@Controller('attendance-device')
export class AttendanceDeviceController {
  constructor(private readonly service: AttendanceDeviceService) {}
  @Post('register') register(@Body() body: Record<string, unknown>, @Ip() ip: string) { return this.service.register(body, ip); }
  @Get('state') state(@Headers('authorization') token?: string) { return this.service.state(token); }
  @Post('events') event(@Headers('authorization') token: string | undefined, @Headers('idempotency-key') key: string | undefined, @Body() body: Record<string, unknown>) { return this.service.event(token, key, body); }
  @Post('receipts') receipts(@Headers('authorization') token: string | undefined, @Body() body: Record<string, unknown>) { return this.service.acknowledge(token, body); }
  @Post('photo-requests/:id')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 3, fieldSize: 200 } }))
  photo(@Headers('authorization') token: string | undefined, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string,
    @Body() body: Record<string, unknown>, @UploadedFile() file?: Express.Multer.File) { return this.service.uploadPhoto(token, id, key, body, file); }
}
