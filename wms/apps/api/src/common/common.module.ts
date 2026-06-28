import { Global, Module } from '@nestjs/common';
import { AuditLogService } from './audit/audit-log.service';
import { PrismaService } from './prisma/prisma.service';
import { TelegramNotificationsService } from './telegram/telegram-notifications.service';

@Global()
@Module({
  providers: [PrismaService, AuditLogService, TelegramNotificationsService],
  exports: [PrismaService, AuditLogService, TelegramNotificationsService],
})
export class CommonModule {}
