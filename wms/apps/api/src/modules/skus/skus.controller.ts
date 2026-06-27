import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateNomenclatureItemDto } from './dto/create-nomenclature-item.dto';
import { CreateSkuDto } from './dto/create-sku.dto';
import { SkusService } from './skus.service';

@ApiTags('skus')
@RequirePermissions('skus:read')
@Controller('skus')
export class SkusController {
  constructor(private readonly skus: SkusService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string, @Query('search') search?: string) {
    return this.skus.list({ clientId, search }, user);
  }

  @Get('nomenclature')
  listNomenclature(@Query('search') search?: string) {
    return this.skus.listNomenclature({ search });
  }

  @Post('nomenclature')
  @RequirePermissions('skus:write')
  createNomenclature(@Body() dto: CreateNomenclatureItemDto) {
    return this.skus.createNomenclature(dto);
  }

  @Post('nomenclature/import-xlsx')
  @RequirePermissions('skus:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: 'Excel-файл общей номенклатуры' })
  @UseInterceptors(FileInterceptor('file'))
  importNomenclatureXlsx(@UploadedFile() file: Express.Multer.File) {
    return this.skus.importNomenclatureWorkbook(file);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.skus.get(id, user);
  }

  @Post()
  @RequirePermissions('skus:write')
  create(@Body() dto: CreateSkuDto, @CurrentUser() user: AuthUser) {
    return this.skus.create(dto, user);
  }

  @Post('import-xlsx')
  @RequirePermissions('skus:write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: 'Excel-файл общей номенклатуры' })
  @UseInterceptors(FileInterceptor('file'))
  importXlsx(@UploadedFile() file: Express.Multer.File) {
    return this.skus.importNomenclatureWorkbook(file);
  }
}
