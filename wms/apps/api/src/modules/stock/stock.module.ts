import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockBalancesService } from './stock-balances.service';
import { StockLedgerService } from './stock-ledger.service';
import { VolumeService } from './volume.service';

@Module({
  controllers: [StockController],
  providers: [StockBalancesService, StockLedgerService, VolumeService],
  exports: [StockBalancesService, StockLedgerService, VolumeService],
})
export class StockModule {}
