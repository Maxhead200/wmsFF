import { TsdOperationStatus, TsdReviewReason } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { TsdPayloadParser } from '../src/modules/tsd/tsd-payload.parser';
import { TsdReviewService } from '../src/modules/tsd/tsd-review.service';

describe('TsdReviewService', () => {
  it('подтверждает inventory_scan и закрывает операцию после ledger adjustment', async () => {
    const prisma = {
      tsdOperation: {
        findUnique: vi.fn().mockResolvedValue(reviewOperation()),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...reviewOperation(), ...data })),
      },
    };
    const stockOperations = {
      adjustInventoryToCounted: vi.fn().mockResolvedValue({
        status: 'APPLIED',
        previousQuantity: 5,
        countedQuantity: 3,
        delta: -2,
      }),
    };
    const service = new TsdReviewService(
      prisma as never,
      { requireClientAccess: vi.fn() } as never,
      stockOperations as never,
      new TsdPayloadParser(),
    );

    await expect(
      service.resolveReviewOperation(
        'operation-1',
        { action: 'APPLY_INVENTORY_ADJUSTMENT', comment: 'Факт подтвержден' },
        user(),
      ),
    ).resolves.toMatchObject({
      operation: {
        status: TsdOperationStatus.ACCEPTED,
      },
      resolution: {
        action: 'APPLY_INVENTORY_ADJUSTMENT',
        adjustment: {
          delta: -2,
        },
      },
    });
    expect(stockOperations.adjustInventoryToCounted).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client-1',
        barcode: '4600001',
        boxCode: 'BOX-1',
        countedQuantity: 3,
        idempotencyKey: 'inventory-1:inventory-adjustment',
      }),
      expect.objectContaining({ id: 'user-1' }),
    );
    expect(prisma.tsdOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TsdOperationStatus.ACCEPTED,
          reviewReason: TsdReviewReason.INVENTORY_MISMATCH,
          resolutionMessage: 'Разбор подтвержден: дельта -2.',
          reviewAction: 'APPLY_INVENTORY_ADJUSTMENT',
        }),
      }),
    );
  });

  it('отклоняет операцию без изменения stock ledger', async () => {
    const prisma = {
      tsdOperation: {
        findUnique: vi.fn().mockResolvedValue(reviewOperation()),
        update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...reviewOperation(), ...data })),
      },
    };
    const stockOperations = {
      adjustInventoryToCounted: vi.fn(),
    };
    const clientScopes = {
      requireClientAccess: vi.fn(),
    };
    const service = new TsdReviewService(
      prisma as never,
      clientScopes as never,
      stockOperations as never,
      new TsdPayloadParser(),
    );

    await expect(
      service.resolveReviewOperation(
        'operation-1',
        { action: 'REJECT', comment: 'Пересчитать повторно', reason: TsdReviewReason.OTHER },
        user(),
      ),
    ).resolves.toMatchObject({
      operation: {
        status: TsdOperationStatus.REJECTED,
        reviewReason: TsdReviewReason.OTHER,
        resolutionMessage: 'Отклонено: Пересчитать повторно',
      },
      resolution: {
        action: 'REJECT',
      },
    });
    expect(stockOperations.adjustInventoryToCounted).not.toHaveBeenCalled();
    expect(clientScopes.requireClientAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'client-1', 'write');
    expect(prisma.tsdOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reviewReason: TsdReviewReason.OTHER,
          resolutionMessage: 'Отклонено: Пересчитать повторно',
        }),
      }),
    );
  });

  it('отдает историю разобранных операций ТСД', async () => {
    const prisma = {
      tsdOperation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const clientScopes = {
      requireGlobalClientAccess: vi.fn(),
    };
    const service = new TsdReviewService(
      prisma as never,
      clientScopes as never,
      { adjustInventoryToCounted: vi.fn() } as never,
      new TsdPayloadParser(),
    );

    await expect(service.listReviewHistory(user())).resolves.toEqual([]);
    expect(clientScopes.requireGlobalClientAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
    expect(prisma.tsdOperation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reviewedAt: {
            not: null,
          },
        },
        orderBy: [{ reviewedAt: 'desc' }],
        take: 200,
      }),
    );
  });
});

function reviewOperation() {
  return {
    id: 'operation-1',
    deviceId: 'tsd-1',
    operationKey: 'inventory-1',
    operationType: 'inventory_scan',
    payload: {
      clientId: 'client-1',
      barcode: '4600001',
      boxCode: 'BOX-1',
      countedQuantity: 3,
    },
    status: TsdOperationStatus.NEEDS_REVIEW,
    serverMessage: 'Расхождение инвентаризации: в WMS 5, на ТСД 3.',
    reviewReason: TsdReviewReason.INVENTORY_MISMATCH,
    resolutionMessage: null,
    reviewAction: null,
    reviewComment: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function user(): AuthUser {
  return {
    id: 'user-1',
    email: 'operator@example.com',
    name: 'Operator',
    roleCodes: ['OPERATOR'],
    permissionCodes: ['stock:write'],
    clientScopeMode: 'ALL',
    clientIds: [],
    writableClientIds: [],
  };
}
