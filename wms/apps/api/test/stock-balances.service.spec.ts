import { describe, expect, it, vi } from 'vitest';
import { StockBalancesService } from '../src/modules/stock/stock-balances.service';

describe('StockBalancesService', () => {
  const service = new StockBalancesService({} as never, {} as never);

  it('строит стабильный ключ баланса без SQL NULL-неоднозначности', () => {
    expect(
      service.balanceKey({
        clientId: 'client-1',
        skuId: 'sku-1',
        boxId: null,
        palletId: null,
        status: 'AVAILABLE',
      }),
    ).toBe('client-1:sku-1:no-box:no-pallet:AVAILABLE');
  });

  it('filters balances by SKU fields and barcode when search is provided', () => {
    const findMany = vi.fn().mockReturnValue([]);
    const searchableService = new StockBalancesService(
      {
        stockBalance: { findMany },
      } as never,
      {
        resolveClientFilter: vi.fn().mockReturnValue('client-1'),
      } as never,
    );

    searchableService.list({ clientId: 'client-1', search: 'BAL2206' }, {} as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: 'client-1',
          sku: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'BAL2206', mode: 'insensitive' } },
              { internalSku: { contains: 'BAL2206', mode: 'insensitive' } },
              { barcodes: { some: { value: { contains: 'BAL2206' } } } },
            ]),
          }),
        }),
        take: 100,
      }),
    );
  });
});
