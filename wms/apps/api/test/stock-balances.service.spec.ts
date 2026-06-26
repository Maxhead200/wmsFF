import { describe, expect, it } from 'vitest';
import { StockBalancesService } from '../src/modules/stock/stock-balances.service';

describe('StockBalancesService', () => {
  const service = new StockBalancesService({} as never);

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
});
