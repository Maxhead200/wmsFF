import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { normalizePrinterGroupCode, PrinterScopeService } from '../auth/printer-scope.service';
import { UpsertPrintPrinterDto, type PrintPrinterConnectionType } from './dto/upsert-print-printer.dto';

@Injectable()
export class PrintPrinterService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly printerScopes: PrinterScopeService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultPrinter();
  }

  listPrinters(user?: AuthUser) {
    return this.prisma.printPrinter.findMany({
      where: user ? { groupCode: this.printerScopes.resolvePrinterGroupFilter(user) } : undefined,
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async listPrinterGroups(user: AuthUser) {
    if (!this.printerScopes.hasGlobalPrinterAccess(user)) {
      return this.printerScopes.allowedGroups(user, 'print').map((groupCode) => ({ groupCode }));
    }

    const [printerGroups, scopedGroups] = await Promise.all([
      this.prisma.printPrinter.findMany({
        select: { groupCode: true },
        distinct: ['groupCode'],
        orderBy: { groupCode: 'asc' },
      }),
      this.prisma.userPrinterGroup.findMany({
        select: { groupCode: true },
        distinct: ['groupCode'],
        orderBy: { groupCode: 'asc' },
      }),
    ]);

    const groups = new Set([...printerGroups, ...scopedGroups].map((item) => normalizePrinterGroupCode(item.groupCode)));
    groups.add('DEFAULT');

    return [...groups].sort((left, right) => left.localeCompare(right)).map((groupCode) => ({ groupCode }));
  }

  async upsertPrinter(dto: UpsertPrintPrinterDto, user?: AuthUser) {
    const code = normalizePrinterCode(dto.code);
    const connectionType = dto.connectionType ?? 'dry_run';
    this.assertConnectionSettings(connectionType, dto);
    const currentPrinter = await this.prisma.printPrinter.findUnique({
      where: { code },
      select: { groupCode: true },
    });
    const groupCode = normalizePrinterGroupCode(dto.groupCode ?? currentPrinter?.groupCode ?? 'DEFAULT');

    if (user) {
      if (currentPrinter) {
        this.printerScopes.requirePrinterGroupAccess(user, currentPrinter.groupCode, 'manage');
      }
      this.printerScopes.requirePrinterGroupAccess(user, groupCode, 'manage');
    }

    return this.prisma.printPrinter.upsert({
      where: { code },
      update: {
        groupCode,
        name: dto.name.trim(),
        connectionType,
        host: connectionType === 'tcp' ? dto.host?.trim() : null,
        port: connectionType === 'tcp' ? dto.port : null,
        isActive: dto.isActive ?? true,
        autoProcess: dto.autoProcess ?? true,
      },
      create: {
        code,
        groupCode,
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
        groupCode: 'DEFAULT',
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
