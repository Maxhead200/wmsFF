import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FulfillmentWaveService } from './fulfillment-wave.service';
import { PickInstructionService } from './pick-instruction.service';
import { PickWaveDocumentService } from './pick-wave-document.service';
import { StockController } from './stock.controller';
import { StockBalancesService } from './stock-balances.service';
import { StockLedgerService } from './stock-ledger.service';
import { StockOperationsService } from './stock-operations.service';
import { VolumeService } from './volume.service';

@Module({
  imports: [AuthModule],
  controllers: [StockController],
  providers: [
    StockBalancesService,
    StockLedgerService,
    StockOperationsService,
    FulfillmentWaveService,
    PickInstructionService,
    PickWaveDocumentService,
    VolumeService,
  ],
  exports: [
    StockBalancesService,
    StockLedgerService,
    StockOperationsService,
    FulfillmentWaveService,
    PickInstructionService,
    PickWaveDocumentService,
    VolumeService,
  ],
})
export class StockModule {}
