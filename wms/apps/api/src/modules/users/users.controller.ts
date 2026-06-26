import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserClientScopesDto } from './dto/update-user-client-scopes.dto';
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

  @Get('roles')
  @RequirePermissions('users:read')
  listRoles() {
    return this.users.listRoles();
  }
}
