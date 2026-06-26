import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockBalancesService } from './stock-balances.service';
import { StockLedgerService } from './stock-ledger.service';
import { StockOperationsService } from './stock-operations.service';
import { VolumeService } from './volume.service';

@Module({
  controllers: [StockController],
  providers: [StockBalancesService, StockLedgerService, StockOperationsService, VolumeService],
  exports: [StockBalancesService, StockLedgerService, StockOperationsService, VolumeService],
})
export class StockModule {}
