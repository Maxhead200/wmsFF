import { Controller, Get, Param, Query } from '@nestjs/common';
import { Body, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreatePickWaveDto } from './dto/create-pick-wave.dto';
import { FulfillClientRequestDto } from './dto/fulfill-client-request.dto';
import { ListPickWavesDto } from './dto/list-pick-waves.dto';
import { ListStockBalancesDto } from './dto/list-stock-balances.dto';
import { PickClientRequestDto } from './dto/pick-client-request.dto';
import { RunPickWaveDto } from './dto/run-pick-wave.dto';
import { TransferBetweenBoxesDto } from './dto/transfer-between-boxes.dto';
import { FulfillmentWaveService } from './fulfillment-wave.service';
import { StockBalancesService } from './stock-balances.service';
import { StockOperationsService } from './stock-operations.service';

@ApiTags('stock')
@RequirePermissions('stock:read')
@Controller('stock')
export class StockController {
  constructor(
    private readonly balances: StockBalancesService,
    private readonly operations: StockOperationsService,
    private readonly waves: FulfillmentWaveService,
  ) {}

  @Get('balances')
  listBalances(@Query() query: ListStockBalancesDto, @CurrentUser() user: AuthUser) {
    return this.balances.list(query, user);
  }

  @Post('transfers/box-to-box')
  @RequirePermissions('stock:write')
  transferBetweenBoxes(@Body() dto: TransferBetweenBoxesDto, @CurrentUser() user: AuthUser) {
    return this.operations.transferBetweenBoxes(dto, user);
  }

  @Post('fulfillment/pick-request')
  @RequirePermissions('stock:write')
  pickClientRequest(@Body() dto: PickClientRequestDto, @CurrentUser() user: AuthUser) {
    return this.operations.pickClientRequest(dto, user);
  }

  @Get('fulfillment/waves')
  @RequirePermissions('stock:write')
  listPickWaves(@Query() query: ListPickWavesDto, @CurrentUser() user: AuthUser) {
    return this.waves.listWaves(query, user);
  }

  @Post('fulfillment/waves')
  @RequirePermissions('stock:write')
  createPickWave(@Body() dto: CreatePickWaveDto, @CurrentUser() user: AuthUser) {
    return this.waves.createWave(dto, user);
  }

  @Post('fulfillment/waves/:id/pick')
  @RequirePermissions('stock:write')
  runPickWave(@Param('id') id: string, @Body() dto: RunPickWaveDto, @CurrentUser() user: AuthUser) {
    return this.waves.runWave(id, dto, user);
  }

  @Post('fulfillment/package-request')
  @RequirePermissions('stock:write')
  packageClientRequest(@Body() dto: FulfillClientRequestDto, @CurrentUser() user: AuthUser) {
    return this.operations.packageClientRequest(dto, user);
  }

  @Post('fulfillment/ship-request')
  @RequirePermissions('stock:write')
  shipClientRequest(@Body() dto: FulfillClientRequestDto, @CurrentUser() user: AuthUser) {
    return this.operations.shipClientRequest(dto, user);
  }
}
