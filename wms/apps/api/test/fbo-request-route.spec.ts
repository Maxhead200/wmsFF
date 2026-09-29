import { describe, it, expect } from 'vitest';
import { loadFboRoutePreference, orderFboRequestBoxes } from '../src/modules/tsd/fbo-request-route';

const box = (id: string, quantity: number, skuId = 'sku') => ({ id, code: id, balances: [{ skuId, quantity, status: 'AVAILABLE' }] });
const decide = (b: ReturnType<typeof box>, demand: Record<string, number>) => ({ allowed: b.balances.every(x => x.quantity <= (demand[x.skuId] ?? 0)) });
describe('request-scoped FBO remainder route', () => {
  // TEST: a recent complete box wins over an older exact fit, without changing demand.
  it('prioritizes preferred whole boxes and leaves inputs intact', () => {
    const boxes = [box('old', 10), box('recent', 6), box('recent2', 4)];
    const before = JSON.stringify(boxes), demand = { sku: 10 };
    expect(orderFboRequestBoxes(boxes, demand, decide, new Set(['recent', 'recent2'])).map(b => b.id)).toEqual(['recent', 'recent2', 'old']);
    expect(demand).toEqual({ sku: 10 }); expect(JSON.stringify(boxes)).toBe(before);
  });
  // TEST: greatest useful remainder reduces partial-box visits.
  it('fills loose demand from the largest useful balance', () => {
    const boxes = [box('small', 1), box('large', 30)];
    expect(orderFboRequestBoxes(boxes, { sku: 5 }, () => ({ allowed: false }), new Set()).map(b => b.id)).toEqual(['large', 'small']);
  });
  // TEST: re-evaluate mixed boxes against the unpicked demand after every choice.
  it('never treats an oversized or unreconciled box as a whole box', () => {
    const boxes = [box('recount', 4), box('whole', 3), box('oversized', 9)];
    const calls: Array<[string, number]> = [];
    orderFboRequestBoxes(boxes, { sku: 5 }, (b, remaining) => { calls.push([b.id, remaining.sku]); return { allowed: b.id === 'whole' && b.balances[0].quantity <= remaining.sku }; }, new Set(['oversized']));
    expect(calls).toContainEqual(['oversized', 2]);
  });
  // TEST: settings for another composition/client/warehouse cannot affect a request.
  it('requires matching identity and composition', async () => {
    const request = { id: 'r', clientId: 'c', warehouseId: 'w' };
    const value = { version: 1, ...request, compositionHash: 'hash', preferredBoxIds: ['b'] };
    const db = (v: unknown) => ({ systemSetting: { findUnique: async () => v == null ? null : ({ value: v }) } });
    expect(await loadFboRoutePreference(db(null), request, 'hash')).toBeNull();
    expect(await loadFboRoutePreference(db(value), request, 'hash')).toEqual(new Set(['b']));
    for (const change of [{ compositionHash: 'old' }, { clientId: 'other' }, { warehouseId: 'other' }, { id: 'other' }, { preferredBoxIds: [4] }]) {
      expect(await loadFboRoutePreference(db({ ...value, ...change }), request, 'hash')).toBeNull();
    }
  });
});
