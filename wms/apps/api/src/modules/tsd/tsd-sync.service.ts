import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StockStatus, TsdReviewReason } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
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
}
