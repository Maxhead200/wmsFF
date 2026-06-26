import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StockController } from './stock.controller';
import { StockBalancesService } from './stock-balances.service';
import { StockLedgerService } from './stock-ledger.service';
import { StockOperationsService } from './stock-operations.service';
import { VolumeService } from './volume.service';

@Module({
  imports: [AuthModule],
  controllers: [StockController],
  providers: [StockBalancesService, StockLedgerService, StockOperationsService, VolumeService],
  exports: [StockBalancesService, StockLedgerService, StockOperationsService, VolumeService],
})
export class StockModule {}
