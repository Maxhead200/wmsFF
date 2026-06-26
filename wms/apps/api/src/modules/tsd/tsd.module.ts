import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { TsdSyncController } from './tsd-sync.controller';
import { TsdSyncService } from './tsd-sync.service';

@Module({
  imports: [StockModule],
  controllers: [TsdSyncController],
  providers: [TsdSyncService],
})
export class TsdModule {}
