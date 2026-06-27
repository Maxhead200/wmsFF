import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ClientsService } from './clients.service';

@ApiTags('clients')
@RequirePermissions('clients:read')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.clients.list(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.clients.get(id, user);
  }

  @Post()
  @RequirePermissions('clients:write')
  create(@Body() dto: CreateClientDto, @CurrentUser() user: AuthUser) {
    return this.clients.create(dto, user);
  }

  @Post('import-xlsx')
  @RequirePermissions('clients:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: 'XLSX-файл клиентов с колонками: Наименование, Дата регистрации, Код' })
  @UseInterceptors(FileInterceptor('file'))
  importXlsx(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    return this.clients.importWorkbook(file, user);
  }

  @Patch(':id')
  @RequirePermissions('clients:write')
  update(@Param('id') id: string, @Body() dto: UpdateClientDto, @CurrentUser() user: AuthUser) {
    return this.clients.update(id, dto, user);
  }

  @Patch(':id/status')
  @RequirePermissions('clients:write')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: AuthUser) {
    return this.clients.updateStatus(id, status, user);
  }

  @Delete(':id')
  @RequirePermissions('clients:write')
  delete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.clients.delete(id, user);
  }
}
