import { describe, expect, it, vi } from 'vitest';
import { StockBalancesService } from '../src/modules/stock/stock-balances.service';
import { BillingService } from '../src/modules/billing/billing.service';

const user = { permissionCodes: ['system:admin'], roleCodes: ['ADMIN'] } as never;
const scopes = { resolveClientFilter: () => 'client-a' } as never;
describe('cabinet compact reads', () => {
  // TEST: the cabinet must not fetch marketplace JSON once per physical balance.
  it('projects stock presentation fields while preserving the client filter', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new StockBalancesService({ stockBalance: { findMany } } as never, scopes).list({ view: 'cabinet' } as never, user);
    const query = findMany.mock.calls[0][0];
    expect(query.include.sku.select).toMatchObject({ name: true, article: true, size: true, color: true, barcodes: true });
    expect(query.include.sku.select.marketplacePayload).toBeUndefined();
    expect(query.where.clientId).toBe('client-a');
  });
  it('does not alter the full stock API', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new StockBalancesService({ stockBalance: { findMany } } as never, scopes).list({}, user);
    expect(findMany.mock.calls[0][0].include.sku).toEqual({ include: { barcodes: true } });
  });
  // TEST: invoice line amounts remain intact without nested charge execution payloads.
  it('keeps invoice rows and totals but excludes charge metadata for the cabinet', async () => {
    const row = { id: 'invoice', totalRub: '150', paidRub: '50', items: [{ id: 'line', quantity: '3', totalRub: '150' }], payments: [] };
    const findMany = vi.fn().mockResolvedValue([row]);
    const result = await new BillingService({ billingInvoice: { findMany } } as never, scopes).listInvoices({ view: 'cabinet' } as never, user);
    expect(findMany.mock.calls[0][0].include.items.include.charge.select.metadata).toBe(false);
    expect(result).toEqual([row]);
    expect(findMany.mock.calls[0][0].where.clientId).toBe('client-a');
    expect(findMany.mock.calls[0][0].where.AND).toEqual({ status: { in: ['ISSUED', 'PAID'] } });
  });
  it('preserves full metadata for ordinary invoice reads', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await new BillingService({ billingInvoice: { findMany } } as never, scopes).listInvoices({}, user);
    expect(findMany.mock.calls[0][0].include.items.include.charge.select.metadata).toBe(true);
  });
});
