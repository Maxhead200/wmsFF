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
          storageAccountingEnabled: true,
          storagePriceRubPerLiterDay: '0.5',
        }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stockMovement: {
        groupBy: vi.fn().mockResolvedValue([
          { skuId: 'sku-1', _min: { createdAt: new Date('2026-06-01T09:00:00.000Z') } },
        ]),
        findMany: vi.fn().mockResolvedValue([
          {
            skuId: 'sku-1',
            quantity: 10,
            createdAt: new Date('2026-06-01T09:00:00.000Z'),
          },
          {
            skuId: 'sku-1',
            quantity: -10,
            createdAt: new Date('2026-06-02T15:00:00.000Z'),
          },
        ]),
      },
      sku: {
        findMany: vi.fn().mockResolvedValue([sku()]),
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
      { date: '2026-06-01', totalLiters: 0, literDays: 0, positions: 0 },
      { date: '2026-06-02', totalLiters: 20, literDays: 20, positions: 1 },
      { date: '2026-06-03', totalLiters: 0, literDays: 0, positions: 0 },
    ]);
    expect(overview.totals).toEqual({
      skuCount: 1,
      quantity: 0,
      totalLiters: 0,
      literDays: 20,
      storageCostRub: 10,
    });
    expect(overview.dailyRows).toEqual([]);
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
          storageAccountingEnabled: true,
          storagePriceRubPerLiterDay: '0.5',
        }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      stockMovement: {
        groupBy: vi.fn().mockResolvedValue([
          { skuId: 'sku-1', _min: { createdAt: new Date('2026-06-01T09:00:00.000Z') } },
        ]),
        findMany: vi.fn().mockResolvedValue([
          {
            skuId: 'sku-1',
            quantity: 10,
            createdAt: new Date('2026-06-01T09:00:00.000Z'),
          },
        ]),
      },
      sku: {
        findMany: vi.fn().mockResolvedValue([sku()]),
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

  it('returns empty overview without reading stock when storage accounting is disabled', async () => {
    const prisma = {
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          code: 'CLIENT',
          name: 'Client',
          storageAccountingEnabled: false,
          storagePriceRubPerLiterDay: '0.5',
        }),
      },
      stockBalance: {
        findMany: vi.fn(),
      },
      stockMovement: {
        findMany: vi.fn(),
        groupBy: vi.fn(),
      },
      sku: {
        findMany: vi.fn(),
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

    expect(overview.client.storageAccountingEnabled).toBe(false);
    expect(overview.tariffRubPerLiterDay).toBe(0.5);
    expect(overview.totals).toEqual({
      skuCount: 0,
      quantity: 0,
      totalLiters: 0,
      literDays: 0,
      storageCostRub: 0,
    });
    expect(overview.rows).toEqual([]);
    expect(overview.daily).toEqual([]);
    expect(overview.dailyRows).toEqual([]);
    expect(prisma.stockBalance.findMany).not.toHaveBeenCalled();
    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
    expect(prisma.stockMovement.groupBy).not.toHaveBeenCalled();
    expect(prisma.sku.findMany).not.toHaveBeenCalled();
  });

  // TEST: расход по заявке должен уменьшить хранение датой создания заявки,
  // а PACKING/SHIPPING не должны повторно попадать в текущий остаток.
  it('uses request creation date for storage write-off and counts only AVAILABLE balances', async () => {
    const prisma = {
      client: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'client-1',
          code: 'CLIENT',
          name: 'Client',
          storageAccountingEnabled: true,
          storagePriceRubPerLiterDay: '0.5',
        }),
      },
      stockBalance: {
        findMany: vi.fn().mockResolvedValue([
          { skuId: 'sku-1', quantity: 9529, box: { code: 'BOX-1' }, pallet: null },
        ]),
      },
      stockMovement: {
        groupBy: vi.fn().mockResolvedValue([
          { skuId: 'sku-1', _min: { createdAt: new Date('2026-08-29T09:00:00.000Z') } },
        ]),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'movement-receipt',
            skuId: 'sku-1',
            type: 'RECEIPT',
            status: 'AVAILABLE',
            quantity: 10095,
            sourceDocument: null,
            createdAt: new Date('2026-08-29T09:00:00.000Z'),
          },
          {
            id: 'movement-pick',
            skuId: 'sku-1',
            type: 'PICK',
            status: 'AVAILABLE',
            quantity: -614,
            sourceDocument: 'request-1',
            createdAt: new Date('2026-08-31T18:00:00.000Z'),
          },
          {
            id: 'movement-same-day-return',
            skuId: 'sku-1',
            type: 'RETURN',
            status: 'AVAILABLE',
            quantity: 48,
            sourceDocument: null,
            createdAt: new Date('2026-08-31T20:00:00.000Z'),
          },
        ]),
      },
      clientRequest: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'request-1', createdAt: new Date('2026-08-30T10:00:00.000Z') },
        ]),
      },
      sku: {
        findMany: vi.fn().mockResolvedValue([sku()]),
      },
    };
    const service = new StorageOverviewService(prisma as never, {
      requireClientAccess: vi.fn(),
    } as never);

    const overview = await service.getOverview(
      {
        clientId: 'client-1',
        periodFrom: '2026-08-31',
        periodTo: '2026-08-31',
      },
      {} as never,
      { includeDailyRows: true },
    );

    expect(prisma.stockBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'AVAILABLE' }) }),
    );
    expect(prisma.clientRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['request-1'] }, clientId: 'client-1' } }),
    );
    expect(overview.totals.quantity).toBe(9529);
    expect(overview.daily).toEqual([
      { date: '2026-08-31', totalLiters: 18962, literDays: 18962, positions: 1 },
    ]);
    expect(overview.dailyRows).toEqual([
      expect.objectContaining({ date: '2026-08-31', skuId: 'sku-1', quantity: 9481 }),
    ]);
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
