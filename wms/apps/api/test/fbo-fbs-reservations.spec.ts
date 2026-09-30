import 'reflect-metadata';
import { expect, it } from 'vitest';
import { FboFbsAvailability } from '../src/modules/tsd/fbo-fbs-reservations';
const reservation = { skuId: 'sku', sourceSkuId: null, relabelConfirmedAt: null,
  boxId: null, reservedBoxId: 'box', itemCount: 1 };

// TEST: 25 physical units include the earlier FBS order's one unit.
it('allows 24 of 25 units and rejects the last unit without consuming the reserve', () => {
  const available = new FboFbsAvailability([{boxId:'box',skuId:'sku',quantity:25}], [reservation]);
  expect(available.free('box','sku')).toBe(24);
  expect(() => available.take('box','sku',25)).toThrow('зарезервирован');
  expect(available.free('box','sku')).toBe(24);
  available.take('box','sku',24);
  expect(() => available.take('box','sku',1)).toThrow('зарезервирован');
});
// TEST: orders awaiting a route share one warehouse quota across several boxes.
it('does not expose an unbound reserve through a different box', () => {
  const available = new FboFbsAvailability(['a','b'].map(boxId=>({boxId,skuId:'sku',quantity:2})),
    [{...reservation,reservedBoxId:null,itemCount:3}]);
  expect(available.free('a','sku')).toBe(1);
  available.take('a','sku',1);
  expect(available.free('b','sku')).toBe(0);
});
// TEST: relabeling protects the source article until conversion is confirmed.
it.each([null, new Date()])('uses the physical article at relabel stage %s', relabelConfirmedAt => {
  const available = new FboFbsAvailability(['source','sku'].map(skuId=>({boxId:'box',skuId,quantity:2})),
    [{...reservation,sourceSkuId:'source',relabelConfirmedAt}]);
  expect(available.free('box','source')).toBe(relabelConfirmedAt ? 2 : 1);
  expect(available.free('box','sku')).toBe(relabelConfirmedAt ? 1 : 2);
});
