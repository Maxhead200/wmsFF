import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TsdOperationStatus, TsdReviewReason } from '@prisma/client';
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
      const reviewReason = dto.reason ?? operation.reviewReason ?? TsdReviewReason.MANUAL_REJECT;
      const reviewComment = dto.comment?.trim();
      const resolutionMessage = reviewComment
        ? `Отклонено: ${reviewComment}`
        : `Отклонено: ${this.reviewReasonLabel(reviewReason)}.`;

      const updated = await this.prisma.tsdOperation.update({
        where: { id: operation.id },
        data: {
          status: TsdOperationStatus.REJECTED,
          reviewReason,
          resolutionMessage,
          reviewAction: dto.action,
          reviewComment,
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
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
    const resolutionMessage = `Разбор подтвержден: дельта ${adjustment.delta}.`;
    const updated = await this.prisma.tsdOperation.update({
      where: { id: operation.id },
      data: {
        status: TsdOperationStatus.ACCEPTED,
        reviewReason: operation.reviewReason ?? TsdReviewReason.INVENTORY_MISMATCH,
        resolutionMessage,
        reviewAction: dto.action,
        reviewComment: dto.comment?.trim(),
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
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

  listReviewHistory(user: AuthUser) {
    this.clientScopes.requireGlobalClientAccess(user);

    return this.prisma.tsdOperation.findMany({
      where: {
        reviewedAt: {
          not: null,
        },
      },
      include: {
        reviewedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: [{ reviewedAt: 'desc' }],
      take: 200,
    });
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

  private reviewReasonLabel(reason: TsdReviewReason) {
    const labels: Record<TsdReviewReason, string> = {
      INVENTORY_MISMATCH: 'расхождение инвентаризации',
      SKU_NOT_FOUND: 'SKU или штрихкод не найден',
      BOX_NOT_FOUND: 'короб не найден',
      RECEIPT_FAILED: 'приемка требует разбора',
      DEVICE_MISMATCH: 'операция пришла не от этого ТСД',
      VALIDATION_ERROR: 'ошибка данных операции',
      MANUAL_REJECT: 'ручное отклонение оператором',
      OTHER: 'другая причина',
    };

    return labels[reason];
  }
}
