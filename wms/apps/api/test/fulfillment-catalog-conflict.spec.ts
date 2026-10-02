import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { StockOperationsService } from '../src/modules/stock/stock-operations.service';

const row = { code: 'box', name: 'Box', unit: 'PIECE', defaultPriceRub: 50 };
function fixture() {
  const catalog = { id: 'service', ...row, isActive: true };
  const price = { id: 'price', priceRub: 17, taxMode: 'INCLUDED', isActive: false };
  const tx = {
    billingService: { findUnique: vi.fn().mockResolvedValue(catalog), upsert: vi.fn().mockResolvedValue(catalog) },
    clientBillingService: { findUnique: vi.fn().mockResolvedValue(price), upsert: vi.fn().mockResolvedValue(price) },
  };
  const service: any = new StockOperationsService({} as never, {} as never, {} as never);
  return { tx, catalog, price, service, run: (input = row) => service.ensureStandardFulfillmentService(tx, 'client', input, 'user') };
}
describe('fulfillment catalog write conflicts', () => {
  afterEach(() => vi.unstubAllEnvs());
  // TEST: finishing FBO 1568 must not contend on an unchanged global catalog row.
  it('reuses an unchanged service and preserves the client tariff without writing', async () => {
    vi.stubEnv('WMS_FULFILLMENT_CATALOG_READ_FIRST', 'true');
    const f = fixture();
    f.tx.billingService.upsert.mockRejectedValue(Object.assign(new Error('write conflict'), { code: 'P2034' }));
    expect(await f.run()).toEqual({ service: f.catalog, clientPrice: f.price, priceRequiresConfirmation: false });
    expect(f.tx.billingService.upsert).not.toHaveBeenCalled();
    expect(f.tx.clientBillingService.upsert).not.toHaveBeenCalled();
    expect(f.tx.clientBillingService.findUnique).toHaveBeenCalledWith({
      where: { clientId_serviceId: { clientId: 'client', serviceId: 'service' } },
    });
  });
  // TEST: Prisma Decimal and nullable prices must not cause unnecessary catalog writes.
  it.each([new Prisma.Decimal(50), null])('compares database prices correctly: %s', async (price) => {
    vi.stubEnv('WMS_FULFILLMENT_CATALOG_READ_FIRST', 'true');
    const f = fixture();
    f.tx.billingService.findUnique.mockResolvedValue({ ...f.catalog, defaultPriceRub: price } as any);
    await f.run({ ...row, defaultPriceRub: price === null ? null : 50 } as any);
    expect(f.tx.billingService.upsert).not.toHaveBeenCalled();
  });
  // TEST: repeated completion retains the existing source-key charge guard.
  it('does not create charges again when their source keys already exist', async () => {
    vi.stubEnv('WMS_FULFILLMENT_CATALOG_READ_FIRST', 'true');
    vi.stubEnv('WMS_WB_ORDER_STOCK_LIFECYCLE_ENABLED', 'false');
    const f = fixture();
    f.service.resolveRequestRelabelUnits = vi.fn().mockResolvedValue(0);
    f.service.resolveRequestProcessingBreakdown = vi.fn().mockResolvedValue({standardUnits: 0, clothingUnits: 0});
    const billingCharge = { findFirst: vi.fn().mockResolvedValue({id: 'existing'}), create: vi.fn() };
    await f.service.createFulfillmentBillingCharges({ ...f.tx, billingCharge,
      wbOrderShipment: {count: vi.fn().mockResolvedValue(0)},
    }, {request: {id: 'request', clientId: 'client'}, packages: [{packageType: 'BOX'}],
      processedUnits: 1, user: {id: 'user'}, serviceDate: new Date()});
    expect(billingCharge.findFirst).toHaveBeenCalled();
    expect(billingCharge.create).not.toHaveBeenCalled();
    expect(f.tx.billingService.upsert).not.toHaveBeenCalled();
  });
  // TEST: sold WMS retains the existing path without the flag.
  it('preserves flag-off behavior', async () => {
    const f = fixture(); await f.run();
    expect(f.tx.billingService.findUnique).not.toHaveBeenCalled();
    expect(f.tx.billingService.upsert).toHaveBeenCalledOnce();
  });
  // TEST: real catalog changes still apply and missing tariffs are created normally.
  it.each([null, { id: 'service', ...row, isActive: false }, { id: 'service', ...row, defaultPriceRub: 51, isActive: true }])(
    'initializes or repairs changed catalog: %j', async (old) => {
      vi.stubEnv('WMS_FULFILLMENT_CATALOG_READ_FIRST', 'true');
      const f = fixture(); f.tx.billingService.findUnique.mockResolvedValue(old as any);
      f.tx.clientBillingService.findUnique.mockResolvedValue(null as any);
      await f.run(); expect(f.tx.billingService.upsert).toHaveBeenCalledOnce();
      expect(f.tx.clientBillingService.upsert).toHaveBeenCalledOnce();
    });
});
