import { BadRequestException, Injectable } from '@nestjs/common';
import { StockStatus } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';
import { StockOperationsService } from '../stock/stock-operations.service';
import { ScanOperationDto, SyncTsdOperationsDto } from './dto/scan-operation.dto';

type TsdOperationResult = {
  operationKey: string;
  operationType: ScanOperationDto['operationType'];
  status: 'ACCEPTED' | 'APPLIED' | 'ALREADY_APPLIED' | 'REJECTED';
  message?: string;
  serverTime: string;
};

type MoveScanPayload = {
  clientId: string;
  barcode?: string;
  skuId?: string;
  fromBoxCode: string;
  toBoxCode: string;
  quantity: number;
  status?: StockStatus;
  comment?: string;
};

@Injectable()
export class TsdSyncService {
  constructor(private readonly stockOperations: StockOperationsService) {}

  async acceptOperation(operation: ScanOperationDto, user: AuthUser) {
    const [result] = await this.syncOperations({ operations: [operation] }, user);
    return result;
  }

  async syncOperations(dto: SyncTsdOperationsDto, user: AuthUser) {
    const results: TsdOperationResult[] = [];

    for (const operation of dto.operations) {
      results.push(await this.applyOperation(operation, user));
    }

    return results;
  }

  private async applyOperation(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    try {
      if (operation.operationType === 'move_scan') {
        return await this.applyMoveScan(operation, user);
      }

      // Русский комментарий: receipt/inventory пока подтверждаем как принятые в очередь; бизнес-обработка будет отдельным срезом.
      return this.result(operation, 'ACCEPTED');
    } catch (caught) {
      return this.result(operation, 'REJECTED', caught instanceof Error ? caught.message : 'Операция ТСД отклонена.');
    }
  }

  private async applyMoveScan(operation: ScanOperationDto, user: AuthUser): Promise<TsdOperationResult> {
    const payload = this.parseMovePayload(operation.payload);
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
        comment: payload.comment ?? `ТСД ${operation.deviceId}`,
      },
      user,
    );

    return this.result(operation, transfer.status === 'ALREADY_APPLIED' ? 'ALREADY_APPLIED' : 'APPLIED');
  }

  private parseMovePayload(payload: Record<string, unknown>): MoveScanPayload {
    const clientId = this.stringValue(payload.clientId, 'clientId');
    const fromBoxCode = this.stringValue(payload.fromBoxCode, 'fromBoxCode');
    const toBoxCode = this.stringValue(payload.toBoxCode, 'toBoxCode');
    const quantity = this.numberValue(payload.quantity, 'quantity');
    const barcode = this.optionalStringValue(payload.barcode);
    const skuId = this.optionalStringValue(payload.skuId);

    if (!barcode && !skuId) {
      throw new BadRequestException('Для move_scan нужен barcode или skuId.');
    }

    return {
      clientId,
      barcode,
      skuId,
      fromBoxCode,
      toBoxCode,
      quantity,
      status: this.optionalStockStatus(payload.status),
      comment: this.optionalStringValue(payload.comment),
    };
  }

  private stringValue(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Поле ${field} обязательно для операции ТСД.`);
    }

    return value.trim();
  }

  private optionalStringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private optionalStockStatus(value: unknown) {
    if (value == null || value === '') {
      return undefined;
    }

    if (typeof value !== 'string' || !Object.values(StockStatus).includes(value as StockStatus)) {
      throw new BadRequestException('Некорректный stock status в операции ТСД.');
    }

    return value as StockStatus;
  }

  private numberValue(value: unknown, field: string) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(`Поле ${field} должно быть положительным целым числом.`);
    }

    return parsed;
  }

  private result(operation: ScanOperationDto, status: TsdOperationResult['status'], message?: string): TsdOperationResult {
    return {
      operationKey: operation.operationKey,
      operationType: operation.operationType,
      status,
      message,
      serverTime: new Date().toISOString(),
    };
  }
}
