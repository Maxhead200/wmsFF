import { expect, it } from 'vitest';
import { equivalentPallets, handlingQuantities, HANDLING_PALLET_RATE } from '../src/modules/expenses/handling-quantities';
import { calculateHandling } from '../src/modules/expenses/payroll-calculation';
// TEST: every full equivalent is exactly 500 RUB, including thirds of a pallet.
it.each([{pallets:'1'},{boxes:'16'},{bags:'5'},{rolls:'30'}])('prices one pallet equivalent at 500 RUB: %j', input => {
  expect(equivalentPallets(handlingQuantities(input))*HANDLING_PALLET_RATE).toBe(50000);
});
it('retains mixed quantities and divides the total without losing kopecks', () => {
  const q=handlingQuantities({pallets:'1.5',boxes:'8',bags:'5',rolls:'30'});
  expect(q).toEqual({palletCount:1.5,boxCount:8,bagCount:5,rollCount:30});
  const result=calculateHandling('2026-10-01T09:00:00Z',equivalentPallets(q),['a','b','c'].map(employeeId=>({employeeId,rates:[{from:'2026-01-01T00:00:00Z',kopecks:50000}]})));
  expect(result.totalKopecks).toBe(200000);expect(result.participants.reduce((s,p)=>s+p.amountKopecks,0)).toBe(200000);
});
it.each([{}, {boxes:'-1'}, {rolls:'0.5'}, {bags:'NaN'}, {pallets:'1.00001'}])('rejects invalid or empty cargo %j', q=>expect(()=>handlingQuantities(q)).toThrow());
