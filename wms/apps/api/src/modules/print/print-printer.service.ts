import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertPrintPrinterDto, type PrintPrinterConnectionType } from './dto/upsert-print-printer.dto';

@Injectable()
export class PrintPrinterService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultPrinter();
  }

  listPrinters() {
    return this.prisma.printPrinter.findMany({
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async upsertPrinter(dto: UpsertPrintPrinterDto) {
    const code = normalizePrinterCode(dto.code);
    const connectionType = dto.connectionType ?? 'dry_run';
    this.assertConnectionSettings(connectionType, dto);

    return this.prisma.printPrinter.upsert({
      where: { code },
      update: {
        name: dto.name.trim(),
        connectionType,
        host: connectionType === 'tcp' ? dto.host?.trim() : null,
        port: connectionType === 'tcp' ? dto.port : null,
        isActive: dto.isActive ?? true,
        autoProcess: dto.autoProcess ?? true,
      },
      create: {
        code,
        name: dto.name.trim(),
        connectionType,
        host: connectionType === 'tcp' ? dto.host?.trim() : null,
        port: connectionType === 'tcp' ? dto.port : null,
        isActive: dto.isActive ?? true,
        autoProcess: dto.autoProcess ?? true,
      },
    });
  }

  async getActivePrinterOrThrow(code: string) {
    const printer = await this.prisma.printPrinter.findUnique({
      where: { code: normalizePrinterCode(code) },
    });

    if (!printer || !printer.isActive) {
      throw new BadRequestException('Принтер не зарегистрирован или отключен.');
    }

    return printer;
  }

  private async ensureDefaultPrinter() {
    const code = normalizePrinterCode(this.config.get<string>('DEFAULT_PRINTER_CODE') ?? 'TSC-01');
    const name = this.config.get<string>('DEFAULT_PRINTER_NAME') ?? 'TSC dry-run';

    // Русский комментарий: dry_run-принтер нужен для пилота и автотестов, пока не подключен реальный TCP-принтер.
    await this.prisma.printPrinter.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name,
        connectionType: 'dry_run',
        isActive: true,
        autoProcess: true,
      },
    });
  }

  private assertConnectionSettings(connectionType: PrintPrinterConnectionType, dto: UpsertPrintPrinterDto) {
    if (connectionType !== 'tcp') {
      return;
    }

    if (!dto.host?.trim() || !dto.port) {
      throw new BadRequestException('Для TCP-принтера нужны host и port.');
    }
  }
}

export function normalizePrinterCode(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new BadRequestException('Код принтера обязателен.');
  }

  return normalized;
}
