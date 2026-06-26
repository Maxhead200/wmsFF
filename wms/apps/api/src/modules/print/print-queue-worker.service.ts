import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type PrintJob, type PrintPrinter } from '@prisma/client';
import { createConnection } from 'node:net';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { PrinterScopeService } from '../auth/printer-scope.service';

type ProcessQueueResult = {
  processed: number;
  printed: number;
  sent: number;
  failed: number;
  skipped: number;
};

type ProcessJobOutcome = 'printed' | 'sent' | 'failed' | 'skipped';

@Injectable()
export class PrintQueueWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrintQueueWorkerService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly printerScopes: PrinterScopeService,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('PRINT_WORKER_DISABLED') === 'true') {
      return;
    }

    const intervalMs = this.config.get<number>('PRINT_WORKER_INTERVAL_MS') ?? 5000;
    this.timer = setInterval(() => {
      void this.processQueued().catch((error) => {
        this.logger.error(error instanceof Error ? error.message : 'Print worker failed');
      });
    }, Math.max(intervalMs, 1000));

    if (typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processQueued(limit = 20, user?: AuthUser, groupCode?: string): Promise<ProcessQueueResult> {
    if (this.isProcessing) {
      return { processed: 0, printed: 0, sent: 0, failed: 0, skipped: 1 };
    }

    this.isProcessing = true;
    try {
      const printers = await this.prisma.printPrinter.findMany({
        where: {
          isActive: true,
          autoProcess: true,
          groupCode: user ? this.printerScopes.resolvePrinterGroupFilter(user, groupCode, 'manage') : undefined,
        },
      });
      if (user) {
        for (const printer of printers) {
          this.printerScopes.requirePrinterGroupAccess(user, printer.groupCode, 'manage');
        }
      }
      const printerByCode = new Map(printers.map((printer) => [printer.code, printer]));
      if (printerByCode.size === 0) {
        return { processed: 0, printed: 0, sent: 0, failed: 0, skipped: 0 };
      }

      const jobs = await this.prisma.printJob.findMany({
        where: {
          status: 'queued',
          printerCode: { in: [...printerByCode.keys()] },
        },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
      const result: ProcessQueueResult = { processed: 0, printed: 0, sent: 0, failed: 0, skipped: 0 };

      for (const job of jobs) {
        const printer = printerByCode.get(job.printerCode);
        if (!printer) {
          result.skipped += 1;
          continue;
        }

        const outcome = await this.processJob(job, printer);
        if (outcome === 'skipped') {
          result.skipped += 1;
          continue;
        }

        result.processed += 1;
        result[outcome] += 1;
      }

      return result;
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: PrintJob, printer: PrintPrinter): Promise<ProcessJobOutcome> {
    const claimed = await this.prisma.printJob.updateMany({
      where: { id: job.id, status: 'queued' },
      data: {
        status: 'sent',
        attempts: { increment: 1 },
        payload: mergePrintPayload(job.payload, {
          sentAt: new Date().toISOString(),
          printerCode: printer.code,
          printerName: printer.name,
        }),
      },
    });
    if (claimed.count === 0) {
      return 'skipped';
    }

    try {
      const sentAt = new Date().toISOString();
      if (printer.connectionType === 'tcp') {
        await this.sendTcp(printer, job.tspl);
        await this.prisma.printPrinter.update({
          where: { id: printer.id },
          data: { lastSeenAt: new Date() },
        });
        await this.prisma.printJob.update({
          where: { id: job.id },
          data: {
            status: 'sent',
            processedAt: new Date(),
            payload: mergePrintPayload(job.payload, {
              sentAt,
              printerCode: printer.code,
              printerName: printer.name,
              statusMessage: 'TSPL отправлен на TCP-принтер.',
            }),
          },
        });
        return 'sent';
      }

      await this.prisma.printPrinter.update({
        where: { id: printer.id },
        data: { lastSeenAt: new Date() },
      });
      await this.prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: 'printed',
          processedAt: new Date(),
          payload: mergePrintPayload(job.payload, {
            sentAt,
            printerCode: printer.code,
            printerName: printer.name,
            printedAt: new Date().toISOString(),
            statusMessage: 'Dry-run printer: TSPL принят без физической отправки.',
          }),
        },
      });
      return 'printed';
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Не удалось отправить TSPL на принтер.';
      await this.prisma.printJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          processedAt: new Date(),
          payload: mergePrintPayload(job.payload, { statusMessage: message }),
        },
      });
      return 'failed';
    }
  }

  private sendTcp(printer: PrintPrinter, tspl: string) {
    const host = printer.host;
    const port = printer.port;
    if (!host || !port) {
      throw new Error('У TCP-принтера не заполнены host или port.');
    }

    return new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host, port, timeout: 5000 }, () => {
        socket.write(tspl, 'utf8', () => {
          socket.end();
        });
      });

      socket.once('error', reject);
      socket.once('timeout', () => {
        socket.destroy();
        reject(new Error('Таймаут отправки TSPL на принтер.'));
      });
      socket.once('close', (hadError) => {
        if (!hadError) {
          resolve();
        }
      });
    });
  }
}

function mergePrintPayload(payload: Prisma.JsonValue, patch: Record<string, string>) {
  const currentPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Prisma.JsonObject) : {};

  return {
    ...currentPayload,
    ...patch,
  } satisfies Prisma.InputJsonObject;
}
