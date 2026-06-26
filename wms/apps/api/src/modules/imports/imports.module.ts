import { Module } from '@nestjs/common';
import { LogisticsModule } from '../logistics/logistics.module';
import { StockModule } from '../stock/stock.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [StockModule, LogisticsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
