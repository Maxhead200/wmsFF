import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientRequestStatus, ClientRequestType, StockStatus, TsdReviewReason } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { PickInstructionService } from '../stock/pick-instruction.service';
import { StockOperationsService } from '../stock/stock-operations.service';
import { ScanOperationDto, SyncTsdOperationsDto } from './dto/scan-operation.dto';
import { TsdDeviceService } from './tsd-device.service';
import { TsdOperationLogService } from './tsd-operation-log.service';
import { TsdOperationResult } from './tsd-operation.types';
import { TsdPayloadParser } from './tsd-payload.parser';

@Injectable()
export class TsdSyncService {
  constructor(
    private readonly stockOperations: StockOperationsService,
    private readonly pickInstructions: PickInstructionService,
    private readonly devices: TsdDeviceService,
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
    private readonly payloadParser: TsdPayloadParser,
    private readonly operationLog: TsdOperationLogService,
  ) {}

  async acceptOperation(operation: ScanOperationDto, user: AuthUser) {
    const [result] = await this.syncOperations({ operations: [operation] }, user);
    return result;
  }

  async syncOperations(dto: SyncTsdOperationsDto, user: AuthUser) {
    await this.devices.touchActiveDevice(user.deviceId);

    const results: TsdOperationResult[] = [];

    for (const operation of dto.operations) {
      results.push(await this.applyOperation(operation, user));
    }

    return results;
  }

  listReviewQueue(user: AuthUser) {
    return this.operationLog.listReviewQueue(user);
  }

  listClients(user: AuthUser) {
    const clientFilter = this.clientScopes.resolveClientFilter(user);
    return this.prisma.client.findMany({
      where: {
        id: clientFilter,
        status: 'ACTIVE',
      },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        legalName: true,
      },
    });
  }

  listActiveRequests(user: AuthUser) {
    const clientFilter = this.clientScopes.resolveClientFilter(user);
    return this.prisma.clientRequest.findMany({
      where: {
        clientId: clientFilter,
        type: ClientRequestType.OUTBOUND,
        status: {
          in: [
            ClientRequestStatus.SUBMITTED,
            ClientRequestStatus.IN_REVIEW,
            ClientRequestStatus.APPROVED,
            ClientRequestStatus.IN_WORK,
            ClientRequestStatus.PACKED,
          ],
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        destinationCity: true,
        createdAt: true,
        updatedAt: true,
        client: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            items: true,
          },
        },
      },
    });
  }

  async getRequestBoxSearch(requestId: string, user: AuthUser) {
    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const requiredBoxes = this.requiredSearchBoxes(document);
    const foundBoxes = await this.loadFoundSearchBoxes(requestId);

    return this.boxSearchState(requestId, requiredBoxes, foundBoxes, null);
  }

  async scanRequestBox(requestId: string, dto: { boxCode?: string }, user: AuthUser) {
    const scannedBox = dto.boxCode?.trim();
    if (!scannedBox) {
      throw new BadRequestException('Сканируйте номер короба.');
    }

    const document = await this.pickInstructions.getRequestInstruction(requestId, user);
    const requiredBoxes = this.requiredSearchBoxes(document);
    const requiredByNormalized = new Map(requiredBoxes.map((box) => [normalizeBoxCode(box), box]));
    const matchedBox = requiredByNormalized.get(normalizeBoxCode(scannedBox));
    const foundBoxes = await this.loadFoundSearchBoxes(requestId);
    const wasAlreadyFound = matchedBox ? foundBoxes.has(matchedBox) : false;

    if (matchedBox && !wasAlreadyFound) {
      foundBoxes.add(matchedBox);
      await this.saveFoundSearchBoxes(requestId, foundBoxes, user.id);
    }

    return this.boxSearchState(requestId, requiredBoxes, foundBoxes, {
      boxCode: scannedBox,
      matched: Boolean(matchedBox) && !wasAlreadyFound,
      alreadyFound: wasAlreadyFound,
      matchedBox: matchedBox ?? null,
    });
  }

  async getSkuByBarcode(clientId: string, barcode: string, user: AuthUser) {
    const normalizedClientId = clientId?.trim();
    const normalizedBarcode = barcode?.trim();
    if (!normalizedClientId || !normalizedBarcode) {
      throw new BadRequestException('Нужно указать клиента и штрихкод.');
    }

    this.clientScopes.requireClientAccess(user, normalizedClientId, 'write');
    const row = await this.prisma.barcode.findFirst({
      where: {
        value: normalizedBarcode,
        sku: { clientId: normalizedClientId },
      },
      include: {
        sku: {
          select: {
            id: true,
            internalSku: true,
            clientSku: true,
            article: true,
            name: true,
            color: true,
            size: true,
            brand: true,
            category: true,
            needsChestnyZnak: true,
            barcodes: {
              select: {
                value: true,
                isPrimary: true,
              },
            },
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException('Товар с таким штрихкодом не найден у клиента.');
    }

    return row.sku;
  }

  private async applyOperation(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    try {
      if (user.deviceCode && operation.deviceId !== user.deviceCode) {
        return await this.operationLog.recordResult(
          operation,
          user,
          'REJECTED',
          'Операция пришла не от устройства из access token.',
          TsdReviewReason.DEVICE_MISMATCH,
        );
      }

      const existing = await this.operationLog.findExisting(operation.operationKey);
      if (existing) {
        return this.operationLog.existingResult(operation, existing);
      }

      if (operation.operationType === 'move_scan') {
        return await this.applyMoveScan(operation, user);
      }

      if (operation.operationType === 'receipt_scan') {
        return await this.applyReceiptScan(operation, user);
      }

      return await this.applyInventoryScan(operation, user);
    } catch (caught) {
      return await this.operationLog.recordResult(
        operation,
        user,
        'REJECTED',
        caught instanceof Error ? caught.message : 'Операция ТСД отклонена.',
        TsdReviewReason.VALIDATION_ERROR,
      );
    }
  }

  private async applyMoveScan(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    const payload = this.payloadParser.parseMovePayload(operation.payload);
    const transfer = await this.stockOperations.transferBetweenBoxes(
      {
        clientId: payload.clientId,
        barcode: payload.barcode,
        skuId: payload.skuId,
        fromBoxCode: payload.fromBoxCode,
        toBoxCode: payload.toBoxCode,
        quantity: payload.quantity,
        status: payload.status,
        idempotencyKey: operation.operationKey,
        comment: payload.comment ?? `ТСД ${operation.deviceId}, сборщик ${user.name}`,
      },
      user,
    );

    return this.operationLog.recordResult(
      operation,
      user,
      transfer.status === 'ALREADY_APPLIED' ? 'ALREADY_APPLIED' : 'APPLIED',
    );
  }

  private async applyReceiptScan(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    const payload = this.payloadParser.parseReceiptPayload(operation.payload);

    try {
      const receipt = await this.stockOperations.receiveIntoBox(
        {
          clientId: payload.clientId,
          barcode: payload.barcode,
          skuId: payload.skuId,
          boxCode: payload.boxCode,
          quantity: payload.quantity,
          kiz: payload.kiz,
          status: payload.status,
          sourceDocument: payload.sourceDocument,
          idempotencyKey: operation.operationKey,
          comment: payload.comment ?? `Приемка ТСД ${operation.deviceId}, сборщик ${user.name}`,
        },
        user,
      );

      return this.operationLog.recordResult(
        operation,
        user,
        receipt.status === 'ALREADY_APPLIED' ? 'ALREADY_APPLIED' : 'APPLIED',
      );
    } catch (caught) {
      return this.operationLog.recordResult(
        operation,
        user,
        'NEEDS_REVIEW',
        caught instanceof Error ? caught.message : 'Приемка ТСД требует разбора.',
        TsdReviewReason.RECEIPT_FAILED,
      );
    }
  }

  private async applyInventoryScan(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    const payload = this.payloadParser.parseInventoryPayload(operation.payload);
    this.clientScopes.requireClientAccess(user, payload.clientId, 'write');

    const sku = await this.findSku(payload.clientId, payload);
    if (!sku) {
      return this.operationLog.recordResult(
        operation,
        user,
        'NEEDS_REVIEW',
        'SKU или штрихкод не найден у клиента.',
        TsdReviewReason.SKU_NOT_FOUND,
      );
    }

    const box = await this.prisma.box.findUnique({
      where: { clientId_code: { clientId: payload.clientId, code: payload.boxCode } },
    });
    if (!box) {
      return this.operationLog.recordResult(
        operation,
        user,
        'NEEDS_REVIEW',
        `Короб ${payload.boxCode} не найден.`,
        TsdReviewReason.BOX_NOT_FOUND,
      );
    }

    const status = payload.status ?? StockStatus.AVAILABLE;
    const balance = await this.prisma.stockBalance.findFirst({
      where: {
        clientId: payload.clientId,
        skuId: sku.id,
        boxId: box.id,
        status,
      },
    });
    const currentQuantity = balance?.quantity ?? 0;

    if (currentQuantity !== payload.countedQuantity) {
      return this.operationLog.recordResult(
        operation,
        user,
        'NEEDS_REVIEW',
        `Расхождение инвентаризации: в WMS ${currentQuantity}, на ТСД ${payload.countedQuantity}.`,
        TsdReviewReason.INVENTORY_MISMATCH,
      );
    }

    return this.operationLog.recordResult(operation, user, 'ACCEPTED', 'Инвентаризация совпала с остатком WMS.');
  }

  private findSku(clientId: string, payload: { skuId?: string; barcode?: string }) {
    if (payload.skuId) {
      return this.prisma.sku.findFirst({ where: { id: payload.skuId, clientId } });
    }

    return this.prisma.barcode
      .findFirst({
        where: {
          value: payload.barcode,
          sku: { clientId },
        },
        include: { sku: true },
      })
      .then((barcode) => barcode?.sku ?? null);
  }

  private requiredSearchBoxes(document: {
    warehouseRows: Array<{ sourceBox: string }>;
    warehouseBalanceMoves: Array<{ sourceBox: string }>;
    warehouseWholeBoxes: Array<{ box: string }>;
  }) {
    return [
      ...new Set(
        [
          ...document.warehouseRows.map((row) => row.sourceBox),
          ...document.warehouseBalanceMoves.map((row) => row.sourceBox),
          ...document.warehouseWholeBoxes.map((row) => row.box),
        ]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].sort((left, right) => left.localeCompare(right, 'ru', { numeric: true }));
  }

  private async loadFoundSearchBoxes(requestId: string) {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: boxSearchKey(requestId) },
    });
    const value = setting?.value;
    const payload = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const foundBoxes = Array.isArray(payload.foundBoxes) ? payload.foundBoxes : [];
    return new Set(foundBoxes.filter((box): box is string => typeof box === 'string' && box.trim().length > 0));
  }

  private async saveFoundSearchBoxes(requestId: string, foundBoxes: Set<string>, userId: string) {
    const boxes = [...foundBoxes].sort((left, right) => left.localeCompare(right, 'ru', { numeric: true }));
    await this.prisma.systemSetting.upsert({
      where: { key: boxSearchKey(requestId) },
      update: {
        value: { foundBoxes: boxes },
        updatedByUserId: userId,
      },
      create: {
        key: boxSearchKey(requestId),
        value: { foundBoxes: boxes },
        updatedByUserId: userId,
      },
    });
  }

  private boxSearchState(
    requestId: string,
    requiredBoxes: string[],
    foundBoxes: Set<string>,
    lastScan: null | { boxCode: string; matched: boolean; alreadyFound: boolean; matchedBox: string | null },
  ) {
    const foundNormalized = new Set([...foundBoxes].map(normalizeBoxCode));
    const boxes = requiredBoxes.map((code) => ({
      code,
      found: foundNormalized.has(normalizeBoxCode(code)),
    }));
    const foundCount = boxes.filter((box) => box.found).length;
    const missingBoxes = boxes.filter((box) => !box.found).map((box) => box.code);

    return {
      requestId,
      total: boxes.length,
      found: foundCount,
      remaining: missingBoxes.length,
      isComplete: missingBoxes.length === 0,
      boxes,
      missingBoxes,
      lastScan,
    };
  }
}

function boxSearchKey(requestId: string) {
  return `TSD_BOX_SEARCH:${requestId}`;
}

function normalizeBoxCode(value: string) {
  return value.trim().toUpperCase();
}
