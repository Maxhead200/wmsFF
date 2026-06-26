import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateSkuDto } from './dto/create-sku.dto';
import { SkusService } from './skus.service';

@ApiTags('skus')
@Controller('skus')
export class SkusController {
  constructor(private readonly skus: SkusService) {}

  @Get()
  list(@Query('clientId') clientId?: string, @Query('search') search?: string) {
    return this.skus.list({ clientId, search });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.skus.get(id);
  }

  @Post()
  create(@Body() dto: CreateSkuDto) {
    return this.skus.create(dto);
  }
}
