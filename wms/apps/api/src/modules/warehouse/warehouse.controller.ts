import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpsertBoxDto } from './dto/upsert-box.dto';
import { UpsertPalletDto } from './dto/upsert-pallet.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('warehouse')
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Get('warehouses')
  listWarehouses() {
    return this.warehouse.listWarehouses();
  }

  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehouse.createWarehouse(dto);
  }

  @Get('zones')
  listZones(@Query('warehouseId') warehouseId?: string) {
    return this.warehouse.listZones(warehouseId);
  }

  @Post('zones')
  createZone(@Body() dto: CreateZoneDto) {
    return this.warehouse.createZone(dto);
  }

  @Get('boxes')
  listBoxes(@Query('clientId') clientId?: string, @Query('code') code?: string) {
    return this.warehouse.listBoxes({ clientId, code });
  }

  @Post('boxes')
  upsertBox(@Body() dto: UpsertBoxDto) {
    return this.warehouse.upsertBox(dto);
  }

  @Get('pallets')
  listPallets(@Query('clientId') clientId?: string) {
    return this.warehouse.listPallets(clientId);
  }

  @Post('pallets')
  upsertPallet(@Body() dto: UpsertPalletDto) {
    return this.warehouse.upsertPallet(dto);
  }
}
