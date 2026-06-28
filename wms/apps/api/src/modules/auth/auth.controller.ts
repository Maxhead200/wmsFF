import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { LoginDto } from './dto/login.dto';
import type { Request } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('bootstrap')
  bootstrapAdmin(@Body() dto: BootstrapAdminDto, @Req() request: Request) {
    return this.auth.bootstrapAdmin(dto, requestMeta(request));
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto, requestMeta(request));
  }

  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}

function requestMeta(request: Request) {
  const forwardedFor = request.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0];

  return {
    ipAddress: normalizeIp(forwardedIp || request.ip || request.socket.remoteAddress || ''),
    userAgent: request.headers['user-agent'] ?? '',
  };
}

function normalizeIp(ipAddress: string) {
  return ipAddress.trim().replace(/^::ffff:/, '');
}
