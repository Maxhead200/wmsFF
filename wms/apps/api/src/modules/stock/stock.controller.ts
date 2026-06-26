import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ListStockBalancesDto } from './dto/list-stock-balances.dto';
import { StockBalancesService } from './stock-balances.service';

@ApiTags('stock')
@Controller('stock')
export class StockController {
  constructor(private readonly balances: StockBalancesService) {}

  @Get('balances')
  listBalances(@Query() query: ListStockBalancesDto) {
    return this.balances.list(query);
  }
}
