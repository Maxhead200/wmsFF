import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { StockOperationsService } from '../src/modules/stock/stock-operations.service';

describe('StockOperationsService', () => {
  const service = new StockOperationsService({} as never, {} as never, {} as never);

  it('планирует перенос между коробами без потери количества', () => {
    expect(service.planTransferQuantities(10, 3, 4)).toEqual({
      sourceQuantity: 6,
      targetQuantity: 7,
    });
  });

  it('не разрешает переносить больше доступного остатка', () => {
    expect(() => service.planTransferQuantities(2, 0, 3)).toThrow(BadRequestException);
  });

  it('создает отрицательную корректировку инвентаризации через ledger', async () => {
    const tx = {
      stockMovement: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(undefined),
      },
      sku: {
        findFirst: vi.fn().mockResolvedValue({ id: 'sku-1' }),
      },
      box: {
        findUnique: vi.fn().mockResolvedValue({ id: 'box-1', code: 'BOX-1', palletId: null }),
      },
      stockBalance: {
        findFirst: vi.fn().mockResolvedValue({ id: 'balance-1', quantity: 5 }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const adjustmentService = new StockOperationsService(
      { $transaction: (callback: (tx: typeof tx) => unknown) => callback(tx) } as never,
      { requireClientAccess: vi.fn() } as never,
      { balanceKey: vi.fn() } as never,
    );

    await expect(
      adjustmentService.adjustInventoryToCounted(
        {
          clientId: 'client-1',
          skuId: 'sku-1',
          boxCode: 'BOX-1',
          countedQuantity: 2,
          idempotencyKey: 'inventory-1',
        },
        user(),
      ),
    ).resolves.toMatchObject({
      status: 'APPLIED',
      previousQuantity: 5,
      countedQuantity: 2,
      delta: -3,
    });
    expect(tx.stockBalance.update).toHaveBeenCalledWith({
      where: { id: 'balance-1' },
      data: { quantity: { decrement: 3 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'INVENTORY_ADJUSTMENT',
          quantity: -3,
          idempotencyKey: 'inventory-1',
        }),
      }),
    );
  });
});

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
