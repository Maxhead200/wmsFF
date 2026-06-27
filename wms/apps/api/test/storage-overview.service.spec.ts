import { MovementType, StockStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { StorageOverviewService } from '../src/modules/stock/storage-overview.service';

describe('StorageOverviewService', () => {
  it('calculates period debt from receipts and shipments, not only current stock', async () => {
    const prisma = {
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          code: 'CLIENT',
          name: 'Client',
          storagePriceRubPerLiterDay: '0.5',
        }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stockMovement: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'move-1',
            clientId: 'client-1',
            skuId: 'sku-1',
            type: MovementType.RECEIPT,
            status: StockStatus.AVAILABLE,
            quantity: 10,
            createdAt: new Date('2026-06-01T09:00:00.000Z'),
            sku: sku(),
          },
          {
            id: 'move-2',
            clientId: 'client-1',
            skuId: 'sku-1',
            type: MovementType.SHIP,
            status: StockStatus.SHIPPING,
            quantity: -10,
            createdAt: new Date('2026-06-02T15:00:00.000Z'),
            sku: sku(),
          },
        ]),
      },
    };
    const service = new StorageOverviewService(prisma as never, {
      requireClientAccess: vi.fn(),
    } as never);

    const overview = await service.getOverview(
      {
        clientId: 'client-1',
        periodFrom: '2026-06-01',
        periodTo: '2026-06-03',
      },
      {} as never,
    );

    expect(overview.daily).toEqual([
      { date: '2026-06-01', totalLiters: 20, literDays: 20, positions: 1 },
      { date: '2026-06-02', totalLiters: 0, literDays: 0, positions: 0 },
      { date: '2026-06-03', totalLiters: 0, literDays: 0, positions: 0 },
    ]);
    expect(overview.totals).toEqual({
      skuCount: 1,
      quantity: 0,
      totalLiters: 0,
      literDays: 20,
      storageCostRub: 10,
    });
    expect(overview.rows[0]).toEqual(
      expect.objectContaining({
        skuId: 'sku-1',
        quantity: 0,
        totalLiters: 0,
        literDays: 20,
        storageCostRub: 10,
      }),
    );
  });

  it('exports daily storage breakdown as xlsx', async () => {
    const prisma = {
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          code: 'CLIENT',
          name: 'Client',
          storagePriceRubPerLiterDay: '0.5',
        }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stockMovement: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'move-1',
            clientId: 'client-1',
            skuId: 'sku-1',
            type: MovementType.RECEIPT,
            status: StockStatus.AVAILABLE,
            quantity: 10,
            createdAt: new Date('2026-06-01T09:00:00.000Z'),
            sku: sku(),
          },
        ]),
      },
    };
    const service = new StorageOverviewService(prisma as never, {
      requireClientAccess: vi.fn(),
    } as never);

    const file = await service.getOverviewXlsx(
      {
        clientId: 'client-1',
        periodFrom: '2026-06-01',
        periodTo: '2026-06-01',
      },
      {} as never,
    );

    expect(file.fileName).toBe('storage-CLIENT-2026-06-01-2026-06-01.xlsx');
    expect(file.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(file.content.subarray(0, 2).toString()).toBe('PK');
  });
});

function sku() {
  return {
    id: 'sku-1',
    internalSku: 'SKU-1',
    clientSku: null,
    article: 'WB-1',
    marketplaceOfferId: null,
    marketplaceProductId: null,
    name: 'Storage item',
    size: 'M',
    lengthCm: '20',
    widthCm: '10',
    heightCm: '10',
    volumeLiters: null,
    barcodes: [{ value: '4600000000001', isPrimary: true }],
  };
}
