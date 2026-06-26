import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ClientRequestsService } from './client-requests.service';
import { CreateClientRequestDto } from './dto/create-client-request.dto';
import { ListClientRequestsDto } from './dto/list-client-requests.dto';
import { UpdateClientRequestStatusDto } from './dto/update-client-request-status.dto';

@ApiTags('client-requests')
@RequirePermissions('client-requests:read')
@Controller('client-requests')
export class ClientRequestsController {
  constructor(private readonly clientRequests: ClientRequestsService) {}

  @Get()
  list(@Query() query: ListClientRequestsDto, @CurrentUser() user: AuthUser) {
    return this.clientRequests.list(query, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.clientRequests.get(id, user);
  }

  @Post()
  @RequirePermissions('client-requests:write')
  create(@Body() dto: CreateClientRequestDto, @CurrentUser() user: AuthUser) {
    return this.clientRequests.create(dto, user);
  }

  @Patch(':id/status')
  @RequirePermissions('client-requests:status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClientRequestStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.clientRequests.updateStatus(id, dto, user);
  }
}
