import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TsdOperationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { StockOperationsService } from '../stock/stock-operations.service';
import { ResolveTsdReviewDto } from './dto/resolve-tsd-review.dto';
import { TsdPayloadParser } from './tsd-payload.parser';

@Injectable()
export class TsdReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
    private readonly stockOperations: StockOperationsService,
    private readonly payloadParser: TsdPayloadParser,
  ) {}

  async resolveReviewOperation(operationId: string, dto: ResolveTsdReviewDto, user: AuthUser) {
    const operation = await this.prisma.tsdOperation.findUnique({
      where: { id: operationId },
    });

    if (!operation || operation.status !== TsdOperationStatus.NEEDS_REVIEW) {
      throw new NotFoundException('Операция ТСД на разборе не найдена.');
    }

    if (dto.action === 'REJECT') {
      this.clientScopes.requireClientAccess(user, this.reviewClientId(operation.operationType, operation.payload), 'write');

      const updated = await this.prisma.tsdOperation.update({
        where: { id: operation.id },
        data: {
          status: TsdOperationStatus.REJECTED,
          serverMessage: dto.comment?.trim() || 'Операция отклонена после ручного разбора.',
        },
      });

      return {
        operation: updated,
        resolution: {
          action: dto.action,
        },
      };
    }

    if (operation.operationType !== 'inventory_scan') {
      throw new BadRequestException('Автоматическая корректировка доступна только для inventory_scan.');
    }

    const payload = this.payloadParser.parseInventoryPayload(operation.payload as Record<string, unknown>);
    this.clientScopes.requireClientAccess(user, payload.clientId, 'write');

    const adjustment = await this.stockOperations.adjustInventoryToCounted(
      {
        clientId: payload.clientId,
        barcode: payload.barcode,
        skuId: payload.skuId,
        boxCode: payload.boxCode,
        countedQuantity: payload.countedQuantity,
        status: payload.status,
        idempotencyKey: `${operation.operationKey}:inventory-adjustment`,
        comment: dto.comment?.trim() || `Подтвержден разбор ТСД ${operation.deviceId}`,
      },
      user,
    );

    // Русский комментарий: после подтверждения расхождение закрывается, а изменение остатка уже отражено в stock ledger.
    const updated = await this.prisma.tsdOperation.update({
      where: { id: operation.id },
      data: {
        status: TsdOperationStatus.ACCEPTED,
        serverMessage: `Разбор подтвержден: дельта ${adjustment.delta}.`,
      },
    });

    return {
      operation: updated,
      resolution: {
        action: dto.action,
        adjustment,
      },
    };
  }

  private reviewClientId(operationType: string, payload: unknown) {
    const rawPayload = payload as Record<string, unknown>;

    if (operationType === 'move_scan') {
      return this.payloadParser.parseMovePayload(rawPayload).clientId;
    }

    if (operationType === 'receipt_scan') {
      return this.payloadParser.parseReceiptPayload(rawPayload).clientId;
    }

    return this.payloadParser.parseInventoryPayload(rawPayload).clientId;
  }
}
