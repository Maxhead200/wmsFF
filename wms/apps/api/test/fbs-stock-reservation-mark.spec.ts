import { MarketplaceType, StockStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { MarketplaceConnectionsService } from '../src/modules/marketplace-connections/marketplace-connections.service';

const task = {
  id: 'task-current',
  marketplace: MarketplaceType.WILDBERRIES,
  completedAt: null,
  itemCount: 1,
  clientId: 'client-1',
  skuId: 'sku-1',
  boxId: 'box-live',
  boxCode: 'FFL_LKX32708_06',
  requestId: 'request-401',
  orderId: '5570593510',
  kiz: 'kiz-current',
};

describe('FBS stock reservation ProductMark synchronization', () => {
  // TEST: a physically picked unit must no longer appear inside its source box.
  it('moves the exact picked KIZ and PACKING balance outside the source box', async () => {
    const productMarkUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      stockMovement: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'movement-1' }),
      },
      box: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'box-live',
          code: 'FFL_LKX32708_06',
          warehouseId: 'warehouse-1',
          palletId: 'pallet-1',
        }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'balance-available',
          warehouseId: 'warehouse-1',
          boxId: 'box-live',
          palletId: 'pallet-1',
          quantity: 1,
        }]),
        delete: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
      },
      productMark: { updateMany: productMarkUpdateMany },
    };
    const service = new MarketplaceConnectionsService({} as never, {} as never);

    await (service as any).reserveCompletedWildberriesStock(
      tx,
      task,
      'warehouse-1',
    );

    expect(tx.stockBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          boxId: null,
          palletId: null,
          status: StockStatus.PACKING,
          quantity: 1,
        }),
      }),
    );
    expect(productMarkUpdateMany).toHaveBeenCalledWith({
      where: {
        clientId: 'client-1',
        skuId: 'sku-1',
        value: 'kiz-current',
        status: StockStatus.AVAILABLE,
      },
      data: {
        status: StockStatus.PACKING,
        boxId: null,
      },
    });
  });

  // TEST: cancellation must not silently put the physically removed unit back into its old box.
  it('returns the exact KIZ to boxless AVAILABLE when the reservation is cancelled', async () => {
    const productMarkUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      stockMovement: {
        findMany: vi.fn().mockResolvedValue([{
          warehouseId: 'warehouse-1',
          boxId: 'box-live',
          palletId: 'pallet-1',
          quantity: 1,
        }]),
        create: vi.fn().mockResolvedValue({ id: 'movement-1' }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([{
          id: 'balance-packing',
          warehouseId: 'warehouse-1',
          boxId: 'box-live',
          palletId: 'pallet-1',
          status: StockStatus.PACKING,
          quantity: 1,
        }]),
        delete: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
      },
      productMark: { updateMany: productMarkUpdateMany },
    };
    const service = new MarketplaceConnectionsService({} as never, {} as never);

    await (service as any).returnCompletedWildberriesStockReservation(tx, task);

    expect(productMarkUpdateMany).toHaveBeenCalledWith({
      where: {
        clientId: 'client-1',
        skuId: 'sku-1',
        value: 'kiz-current',
        status: StockStatus.PACKING,
      },
      data: {
        status: StockStatus.AVAILABLE,
        boxId: null,
      },
    });
    expect(tx.stockBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          boxId: null,
          palletId: null,
          status: StockStatus.AVAILABLE,
          quantity: 1,
        }),
      }),
    );
  });
});
