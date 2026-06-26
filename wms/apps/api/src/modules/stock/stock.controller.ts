import { Controller, Get, Query } from '@nestjs/common';
import { Body, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
  listBalances(@Query() query: ListStockBalancesDto) {
    return this.balances.list(query);
  }

  @Post('transfers/box-to-box')
  @RequirePermissions('stock:write')
  transferBetweenBoxes(@Body() dto: TransferBetweenBoxesDto) {
    return this.operations.transferBetweenBoxes(dto);
  }
}
