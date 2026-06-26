import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StockStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { LogisticsService } from '../logistics/logistics.service';
import { StockBalancesService } from '../stock/stock-balances.service';
import { parseLogisticsTariffSheet } from './parsers/logistics-xlsx.parser';
import { parseStockSheet, type SheetMatrix, type StockImportItem } from './parsers/stock-xlsx.parser';

type CommitStockOptions = {
  clientId: string;
  sourceDocument: string;
  user: AuthUser;
};

type CommitLogisticsOptions = {
  name: string;
  sourceFile?: string;
  activeFrom?: string;
  activeTo?: string;
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: StockBalancesService,
    private readonly clientScopes: ClientScopeService,
    private readonly logistics: LogisticsService,
  ) {}

  previewStockWorkbook(buffer: Buffer, clientId: string, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, clientId, 'write');

    const rows = this.readFirstSheet(buffer);
    const parsed = parseStockSheet(rows, { clientId });

    return {
      clientId,
      summary: parsed.summary,
      issues: parsed.issues,
      sample: parsed.items.slice(0, 20),
    };
  }

  previewLogisticsWorkbook(buffer: Buffer) {
    const rows = this.readFirstSheet(buffer);
    const parsed = parseLogisticsTariffSheet(rows);

    return {
      note: parsed.note,
      directionsCount: parsed.directions.length,
      directions: parsed.directions,
      issues: parsed.issues,
    };
  }

  async commitLogisticsWorkbook(buffer: Buffer, options: CommitLogisticsOptions) {
    const rows = this.readFirstSheet(buffer);
    const parsed = parseLogisticsTariffSheet(rows);
    const tariffSet = await this.logistics.commitTariffSet(parsed, options);

    return {
      tariffSetId: tariffSet.id,
      name: tariffSet.name,
      sourceFile: tariffSet.sourceFile,
      directionsCount: tariffSet.directions.length,
      tiersCount: tariffSet.directions.reduce((sum, direction) => sum + direction.tiers.length, 0),
    };
  }

  async commitStockWorkbook(buffer: Buffer, options: CommitStockOptions) {
    this.clientScopes.requireClientAccess(options.user, options.clientId, 'write');

    const rows = this.readFirstSheet(buffer);
    const parsed = parseStockSheet(rows, { clientId: options.clientId });
    const errors = parsed.issues.filter((issue) => issue.severity === 'error');

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Файл содержит ошибки, импорт в WMS остановлен.',
        errors,
        summary: parsed.summary,
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const counters = {
        boxesTouched: 0,
        skusTouched: 0,
        movementsCreated: 0,
        balancesTouched: 0,
      };

      for (const item of parsed.items) {
        const box = await this.ensureBox(tx, item);
        const sku = await this.ensureSku(tx, item);

        await this.ensureBarcode(tx, sku.id, item.barcode);
        const movementCreated = await this.createInitialMovement(tx, item, sku.id, box.id, options.sourceDocument);
        await this.addToBalance(tx, item, sku.id, box.id, 'AVAILABLE');

        counters.boxesTouched += 1;
        counters.skusTouched += 1;
        counters.movementsCreated += movementCreated ? 1 : 0;
        counters.balancesTouched += 1;
      }

      return counters;
    });

    return {
      sourceDocument: options.sourceDocument,
      summary: parsed.summary,
      warnings: parsed.issues.filter((issue) => issue.severity === 'warning'),
      result,
    };
  }

  private readFirstSheet(buffer: Buffer): SheetMatrix {
    // Русский комментарий: XLSX читаем как матрицу, чтобы не зависеть от кривых merged cells в исходных файлах.
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json<SheetMatrix[number]>(worksheet, {
      header: 1,
      raw: false,
      blankrows: false,
    });
  }

  private ensureBox(tx: Prisma.TransactionClient, item: StockImportItem) {
    return tx.box.upsert({
      where: {
        clientId_code: {
          clientId: item.clientId,
          code: item.boxCode,
        },
      },
      update: {},
      create: {
        clientId: item.clientId,
        code: item.boxCode,
      },
    });
  }

  private async ensureSku(tx: Prisma.TransactionClient, item: StockImportItem) {
    const existingBarcode = await tx.barcode.findFirst({
      where: {
        value: item.barcode,
        sku: { clientId: item.clientId },
      },
      include: { sku: true },
    });

    if (existingBarcode) {
      return existingBarcode.sku;
    }

    // Русский комментарий: для первичного импорта внутренний SKU строим из штрихкода, потому что это самый стабильный идентификатор в файле.
    return tx.sku.create({
      data: {
        clientId: item.clientId,
        internalSku: `BAR-${item.barcode}`,
        name: item.name,
        color: item.color,
        size: item.size,
      },
    });
  }

  private ensureBarcode(tx: Prisma.TransactionClient, skuId: string, barcode: string) {
    return tx.barcode.upsert({
      where: {
        skuId_value: {
          skuId,
          value: barcode,
        },
      },
      update: { isPrimary: true },
      create: {
        skuId,
        value: barcode,
        isPrimary: true,
      },
    });
  }

  private async createInitialMovement(
    tx: Prisma.TransactionClient,
    item: StockImportItem,
    skuId: string,
    boxId: string,
    sourceDocument: string,
  ) {
    const idempotencyKey = ['stock-import', sourceDocument, item.sourceRow, item.boxCode, item.barcode].join(':');
    const exists = await tx.stockMovement.findUnique({ where: { idempotencyKey } });

    if (exists) {
      return false;
    }

    await tx.stockMovement.create({
      data: {
        clientId: item.clientId,
        skuId,
        boxId,
        type: 'INITIAL_IMPORT',
        status: 'AVAILABLE',
        quantity: item.quantity,
        sourceDocument,
        idempotencyKey,
        comment: 'Первичная загрузка остатков из XLSX',
      },
    });

    return true;
  }

  private async addToBalance(
    tx: Prisma.TransactionClient,
    item: StockImportItem,
    skuId: string,
    boxId: string,
    status: StockStatus,
  ) {
    const balanceKey = this.balances.balanceKey({
      clientId: item.clientId,
      skuId,
      boxId,
      status,
    });

    await tx.stockBalance.upsert({
      where: { balanceKey },
      update: {
        quantity: { increment: item.quantity },
      },
      create: {
        balanceKey,
        clientId: item.clientId,
        skuId,
        boxId,
        status,
        quantity: item.quantity,
      },
    });
  }
}
