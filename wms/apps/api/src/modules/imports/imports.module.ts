import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';

@Module({
  imports: [StockModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
