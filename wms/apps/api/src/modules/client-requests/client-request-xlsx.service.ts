import { BadRequestException, Injectable } from '@nestjs/common';
import { ClientRequestPriority, ClientRequestType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { ClientRequestsService, type ClientRequestAvailabilityConflict } from './client-requests.service';
import { ImportOutboundRequestXlsxDto } from './dto/import-outbound-request-xlsx.dto';
import {
  parseOutboundRequestXlsxRows,
  type OutboundRequestXlsxIssue,
  type SheetMatrix,
} from './parsers/outbound-request-xlsx.parser';

type HydratedOutboundLine = {
  barcode: string;
  requestedQuantity: number;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
  sourceRows: number[];
  skuId: string | null;
  internalSku: string | null;
  name: string | null;
  canFulfill: boolean;
  conflicts: ClientRequestAvailabilityConflict[];
};

type OutboundRequestXlsxPreview = {
  clientId: string;
  title: string;
  canCommit: boolean;
  summary: {
    sourceRows: number;
    lines: number;
    totalQuantity: number;
    availableQuantity: number;
    shortageQuantity: number;
  };
  issues: OutboundRequestXlsxIssue[];
  lines: HydratedOutboundLine[];
};

@Injectable()
export class ClientRequestXlsxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
    private readonly clientRequests: ClientRequestsService,
  ) {}

  async previewOutboundRequest(file: Express.Multer.File | undefined, dto: ImportOutboundRequestXlsxDto, user: AuthUser) {
    this.assertFile(file);
    return this.buildPreview(file!.buffer, dto, user);
  }

  async createOutboundRequest(file: Express.Multer.File | undefined, dto: ImportOutboundRequestXlsxDto, user: AuthUser) {
    this.assertFile(file);
    const preview = await this.buildPreview(file!.buffer, dto, user);
    const errors = preview.issues.filter((issue) => issue.severity === 'error');

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Excel-файл содержит ошибки, заявка не создана.',
        errors,
        summary: preview.summary,
      });
    }

    const request = await this.clientRequests.create(
      {
        clientId: preview.clientId,
        type: ClientRequestType.OUTBOUND,
        priority: dto.priority ?? ClientRequestPriority.NORMAL,
        title: preview.title,
        comment: this.buildImportComment(dto.comment, normalizeUploadedFileName(file!.originalname), preview),
        contactName: normalizeText(dto.contactName),
        contactPhone: normalizeText(dto.contactPhone),
        deliveryAddress: normalizeText(dto.deliveryAddress),
        desiredDate: dto.desiredDate,
        items: preview.lines.map((line) => ({
          skuId: line.skuId ?? undefined,
          barcode: line.barcode,
          name: line.name ?? undefined,
          quantity: line.requestedQuantity,
          comment: `Excel rows: ${line.sourceRows.join(', ')}`,
        })),
      },
      user,
    );

    return {
      request,
      preview,
    };
  }

  private async buildPreview(buffer: Buffer, dto: ImportOutboundRequestXlsxDto, user: AuthUser): Promise<OutboundRequestXlsxPreview> {
    const clientId = normalizeRequiredText(dto.clientId, 'Клиент обязателен.');
    this.clientScopes.requireClientAccess(user, clientId, 'write');

    const parsed = parseOutboundRequestXlsxRows(this.readFirstSheet(buffer));
    const barcodes = parsed.lines.map((line) => line.barcode);
    const barcodeRows = barcodes.length
      ? await this.prisma.barcode.findMany({
          where: {
            value: { in: barcodes },
            sku: { clientId },
          },
          include: {
            sku: {
              select: {
                id: true,
                internalSku: true,
                name: true,
              },
            },
          },
        })
      : [];

    const barcodeMatches = new Map<string, typeof barcodeRows>();
    for (const row of barcodeRows) {
      barcodeMatches.set(row.value, [...(barcodeMatches.get(row.value) ?? []), row]);
    }

    const availability = await this.clientRequests.previewAvailability(
      {
        clientId,
        type: ClientRequestType.OUTBOUND,
        items: parsed.lines.map((line) => ({
          barcode: line.barcode,
          quantity: line.quantity,
        })),
      },
      user,
    );
    const issues = [...parsed.issues];
    const lines: HydratedOutboundLine[] = [];

    for (const [lineIndex, line] of parsed.lines.entries()) {
      const matches = barcodeMatches.get(line.barcode) ?? [];
      const firstRow = line.sourceRows[0] ?? 1;
      const availabilityLine = availability.lines[lineIndex];

      if (matches.length === 0) {
        issues.push({
          row: firstRow,
          barcode: line.barcode,
          message: 'Баркод не найден в SKU клиента.',
          severity: 'error',
        });
        lines.push(this.emptyHydratedLine(line));
        continue;
      }

      if (new Set(matches.map((match) => match.skuId)).size > 1) {
        issues.push({
          row: firstRow,
          barcode: line.barcode,
          message: 'Баркод привязан к нескольким SKU клиента.',
          severity: 'error',
        });
        lines.push(this.emptyHydratedLine(line));
        continue;
      }

      const match = matches[0];
      const stockQuantity = availabilityLine?.stockQuantity ?? 0;
      const reservedQuantity = availabilityLine?.reservedQuantity ?? 0;
      const availableQuantity = availabilityLine?.availableQuantity ?? 0;
      const shortageQuantity = Math.max(0, line.quantity - availableQuantity);
      const conflicts = availabilityLine?.conflicts ?? [];

      if (shortageQuantity > 0) {
        issues.push({
          row: firstRow,
          barcode: line.barcode,
          message: shortageMessage(line.quantity, availableQuantity, conflicts),
          severity: 'error',
        });
      }

      lines.push({
        barcode: line.barcode,
        requestedQuantity: line.quantity,
        stockQuantity,
        reservedQuantity,
        availableQuantity,
        shortageQuantity,
        sourceRows: line.sourceRows,
        skuId: match.sku.id,
        internalSku: match.sku.internalSku,
        name: match.sku.name,
        canFulfill: shortageQuantity === 0,
        conflicts,
      });
    }

    const totalAvailableQuantity = lines.reduce((sum, line) => sum + Math.min(line.availableQuantity, line.requestedQuantity), 0);
    const totalShortageQuantity = lines.reduce((sum, line) => sum + line.shortageQuantity, 0);
    const errorsCount = issues.filter((issue) => issue.severity === 'error').length;

    return {
      clientId,
      title: normalizeText(dto.title) ?? defaultTitle(),
      canCommit: errorsCount === 0 && lines.length > 0,
      summary: {
        ...parsed.summary,
        availableQuantity: totalAvailableQuantity,
        shortageQuantity: totalShortageQuantity,
      },
      issues,
      lines,
    };
  }

  private readFirstSheet(buffer: Buffer): SheetMatrix {
    // Русский комментарий: для клиентского шаблона берем первый лист, чтобы файл мог называться и оформляться свободно.
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new BadRequestException('В Excel-файле нет листов.');
    }

    return XLSX.utils.sheet_to_json<SheetMatrix[number]>(workbook.Sheets[firstSheet], {
      header: 1,
      raw: false,
      blankrows: false,
    });
  }

  private emptyHydratedLine(line: { barcode: string; quantity: number; sourceRows: number[] }): HydratedOutboundLine {
    return {
      barcode: line.barcode,
      requestedQuantity: line.quantity,
      stockQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      shortageQuantity: line.quantity,
      sourceRows: line.sourceRows,
      skuId: null,
      internalSku: null,
      name: null,
      canFulfill: false,
      conflicts: [],
    };
  }

  private buildImportComment(comment: string | undefined, sourceFile: string, preview: OutboundRequestXlsxPreview) {
    return [
      normalizeText(comment),
      `Создано из Excel: ${sourceFile}. Позиций: ${preview.summary.lines}, количество: ${preview.summary.totalQuantity}.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private assertFile(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Нужно приложить Excel-файл.');
    }
  }
}

function normalizeText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeUploadedFileName(value?: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return 'request.xlsx';
  }

  if (!/[ÃÐÑ]/.test(normalized)) {
    return normalized;
  }

  const decoded = Buffer.from(normalized, 'latin1').toString('utf8');
  return decoded.includes('�') ? normalized : decoded;
}

function normalizeRequiredText(value: string | undefined, message: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new BadRequestException(message);
  }

  return normalized;
}

function shortageMessage(needed: number, available: number, conflicts: ClientRequestAvailabilityConflict[]) {
  const base = `Недостаточно доступного остатка: нужно ${needed}, доступно ${available}.`;
  if (conflicts.length === 0) {
    return base;
  }

  const conflictText = conflicts
    .slice(0, 3)
    .map((conflict) => `${conflict.title} от ${new Date(conflict.createdAt).toLocaleDateString('ru-RU')} (${conflict.type})`)
    .join('; ');

  return `${base} Товар участвует в активной заявке: ${conflictText}.`;
}

function defaultTitle() {
  return `Сборка из Excel ${new Date().toLocaleDateString('ru-RU')}`;
}
