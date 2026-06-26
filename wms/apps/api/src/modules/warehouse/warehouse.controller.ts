import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpsertBoxDto } from './dto/upsert-box.dto';
import { UpsertPalletDto } from './dto/upsert-pallet.dto';
import { WarehouseService } from './warehouse.service';

@ApiTags('warehouse')
@RequirePermissions('warehouse:read')
@Controller('warehouse')
export class WarehouseController {
  constructor(private readonly warehouse: WarehouseService) {}

  @Get('warehouses')
  listWarehouses() {
    return this.warehouse.listWarehouses();
  }

  @Post('warehouses')
  @RequirePermissions('warehouse:write')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehouse.createWarehouse(dto);
  }

  @Get('zones')
  listZones(@Query('warehouseId') warehouseId?: string) {
    return this.warehouse.listZones(warehouseId);
  }

  @Post('zones')
  @RequirePermissions('warehouse:write')
  createZone(@Body() dto: CreateZoneDto) {
    return this.warehouse.createZone(dto);
  }

  @Get('boxes')
  listBoxes(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string, @Query('code') code?: string) {
    return this.warehouse.listBoxes({ clientId, code }, user);
  }

  @Post('boxes')
  @RequirePermissions('warehouse:write')
  upsertBox(@Body() dto: UpsertBoxDto, @CurrentUser() user: AuthUser) {
    return this.warehouse.upsertBox(dto, user);
  }

  @Get('pallets')
  listPallets(@CurrentUser() user: AuthUser, @Query('clientId') clientId?: string) {
    return this.warehouse.listPallets(clientId, user);
  }

  @Post('pallets')
  @RequirePermissions('warehouse:write')
  upsertPallet(@Body() dto: UpsertPalletDto, @CurrentUser() user: AuthUser) {
    return this.warehouse.upsertPallet(dto, user);
  }
}
