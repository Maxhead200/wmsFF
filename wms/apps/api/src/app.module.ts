import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './common/prisma/prisma.service';
import { AuditLogService } from './common/audit/audit-log.service';
import { HealthController } from './modules/health/health.controller';
import { ImportsModule } from './modules/imports/imports.module';
import { PrintModule } from './modules/print/print.module';
import { StockModule } from './modules/stock/stock.module';
import { TsdModule } from './modules/tsd/tsd.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StockModule,
    ImportsModule,
    PrintModule,
    TsdModule,
  ],
  controllers: [HealthController],
  providers: [PrismaService, AuditLogService],
})
export class AppModule {}
