import { Controller, Get, Query } from '@nestjs/common';
import { Body, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { ListStockBalancesDto } from './dto/list-stock-balances.dto';
import { TransferBetweenBoxesDto } from './dto/transfer-between-boxes.dto';
import { StockBalancesService } from './stock-balances.service';
import { StockOperationsService } from './stock-operations.service';

@ApiTags('stock')
@RequirePermissions('stock:read')
@Controller('stock')
export class StockController {
  constructor(
    private readonly balances: StockBalancesService,
    private readonly operations: StockOperationsService,
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
}
