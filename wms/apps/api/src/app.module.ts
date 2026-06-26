import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { HealthController } from './modules/health/health.controller';
import { ClientsModule } from './modules/clients/clients.module';
import { ImportsModule } from './modules/imports/imports.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { PrintModule } from './modules/print/print.module';
import { SkusModule } from './modules/skus/skus.module';
import { StockModule } from './modules/stock/stock.module';
import { TsdModule } from './modules/tsd/tsd.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    ClientsModule,
    SkusModule,
    WarehouseModule,
    StockModule,
    LogisticsModule,
    ImportsModule,
    PrintModule,
    TsdModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
