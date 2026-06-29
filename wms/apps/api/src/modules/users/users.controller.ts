import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserClientScopesDto } from './dto/update-user-client-scopes.dto';
import { UpdateUserPrinterScopesDto } from './dto/update-user-printer-scopes.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  list() {
    return this.users.list();
  }

  @Post()
  @RequirePermissions('users:write')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id/client-scopes')
  @RequirePermissions('users:write')
  updateClientScopes(@Param('id') id: string, @Body() dto: UpdateUserClientScopesDto) {
    return this.users.updateClientScopes(id, dto);
  }

  @Patch(':id/printer-scopes')
  @RequirePermissions('users:write')
  updatePrinterScopes(@Param('id') id: string, @Body() dto: UpdateUserPrinterScopesDto) {
    return this.users.updatePrinterScopes(id, dto);
  }

  @Patch(':id/roles')
  @RequirePermissions('users:write')
  updateRoles(@Param('id') id: string, @Body() dto: UpdateUserRolesDto) {
    return this.users.updateRoles(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('users:write')
  delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.users.delete(id, user);
  }

  @Get('roles')
  @RequirePermissions('users:read')
  listRoles() {
    return this.users.listRoles();
  }
}
