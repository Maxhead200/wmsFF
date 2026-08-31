import { StockStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { TurnoverService } from '../src/modules/turnover/turnover.service';

describe('TurnoverService physical stock presentation', () => {
  // TEST: PACKING/SHIPPING are already removed from the box and must be shown separately.
  it('separates physical stock from picked and shipping stock', async () => {
    const balances = [
      { id: 'available', boxId: null, palletId: null, status: StockStatus.AVAILABLE, quantity: 2, box: null, pallet: null },
      { id: 'hold', boxId: null, palletId: null, status: StockStatus.HOLD, quantity: 2, box: null, pallet: null },
      { id: 'packing', boxId: null, palletId: null, status: StockStatus.PACKING, quantity: 1, box: null, pallet: null },
      { id: 'shipping', boxId: null, palletId: null, status: StockStatus.SHIPPING, quantity: 1, box: null, pallet: null },
    ];
    const prisma = {
      sku: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'sku-1',
            client: { id: 'client-1', code: 'CLIENT', name: 'Клиент' },
            internalSku: 'SKU-1',
            clientSku: null,
            article: 'ART-1',
            name: 'Костюм',
            color: 'Синий',
            size: '46',
            volumeLiters: null,
            barcodes: [{ value: '0460000000001' }],
            balances,
            productMarks: [],
            movements: [],
          },
        ]),
      },
    };
    const service = new TurnoverService(
      prisma as never,
      { resolveClientFilter: vi.fn().mockReturnValue('client-1') } as never,
    );
    const user: AuthUser = {
      id: 'admin-1',
      email: 'admin@example.test',
      name: 'Администратор',
      roleCodes: ['ADMIN'],
      permissionCodes: ['system:admin'],
      clientScopeMode: 'ALL',
      clientIds: [],
      writableClientIds: [],
    };

    const report = await service.list({ clientId: 'client-1' }, user);

    expect(report.items[0]).toMatchObject({
      currentQuantity: 6,
      physicalQuantity: 4,
      processingQuantity: 2,
    });
    expect(report.totals).toMatchObject({
      currentQuantity: 6,
      physicalQuantity: 4,
      processingQuantity: 2,
    });
  });
});
