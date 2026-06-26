import { Module } from '@nestjs/common';
import { StockLedgerService } from './stock-ledger.service';
import { VolumeService } from './volume.service';

@Module({
  providers: [StockLedgerService, VolumeService],
  exports: [StockLedgerService, VolumeService],
})
export class StockModule {}
