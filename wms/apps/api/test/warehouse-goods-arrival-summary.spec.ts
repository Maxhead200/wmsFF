import { afterEach, expect, it, vi } from 'vitest';
import { WarehouseService } from '../src/modules/warehouse/warehouse.service';

afterEach(() => vi.useRealTimers());

// TEST: payment after November arrivals must not exclude those arrivals.
it('calculates the estimate from the day after the paid invoice period', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-05T17:30:00Z'));
  const listGoodsArrivals = vi.fn(async ({ periodFrom }: { periodFrom: string }) =>
    '2026-11-04' >= periodFrom ? [{ bagCount: 32, boxCount: 0 }, { bagCount: 35, boxCount: 0 }] : [],
  );
  const service = {
    clientScopes: { requireClientAccess: vi.fn() },
    prisma: {
      billingInvoice: {
        findFirst: vi.fn().mockResolvedValue({
          periodTo: new Date('2026-10-31T23:59:59.999Z'),
          paidAt: new Date('2026-11-05T17:02:00Z'),
        }),
      },
      clientBillingService: {
        findMany: vi.fn().mockResolvedValue([
          { serviceId: 'bags', priceRub: 300, taxMode: 'ADD_6_PERCENT' },
        ]),
      },
    },
    listGoodsArrivals,
    ensurePprServices: vi.fn().mockResolvedValue({ bags: { id: 'bags' }, boxes: { id: 'boxes' } }),
  };

  const result = await WarehouseService.prototype.goodsArrivalSummary.call(
    service as unknown as WarehouseService, 'client-1', {} as never,
  );

  expect(result).toMatchObject({ periodFrom: '2026-11-01', bagCount: 67, estimatedRub: 21383.05 });
});
