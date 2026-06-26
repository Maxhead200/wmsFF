import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
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

  @Get('roles')
  @RequirePermissions('users:read')
  listRoles() {
    return this.users.listRoles();
  }
}
