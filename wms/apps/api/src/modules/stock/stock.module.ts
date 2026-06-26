import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FulfillmentWaveService } from './fulfillment-wave.service';
import { StockController } from './stock.controller';
import { StockBalancesService } from './stock-balances.service';
import { StockLedgerService } from './stock-ledger.service';
import { StockOperationsService } from './stock-operations.service';
import { VolumeService } from './volume.service';

@Module({
  imports: [AuthModule],
  controllers: [StockController],
  providers: [StockBalancesService, StockLedgerService, StockOperationsService, FulfillmentWaveService, VolumeService],
  exports: [StockBalancesService, StockLedgerService, StockOperationsService, FulfillmentWaveService, VolumeService],
})
export class StockModule {}
