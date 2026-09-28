import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { calculateWorkDay } from '../src/modules/expenses/payroll-calculation';

// TEST: an explicit daily lunch is deducted once, proportionally across rates and visits.
describe('manual daily lunch', () => {
  const intervals = [{ start: '2026-09-27T09:00:00+03:00', end: '2026-09-27T13:00:00+03:00' },
    { start: '2026-09-27T14:00:00+03:00', end: '2026-09-27T18:00:00+03:00' }];
  const rates = [{ from: '2026-01-01T00:00:00Z', to: '2026-09-27T14:00:00+03:00', kopecks: 30000 },
    { from: '2026-09-27T14:00:00+03:00', kopecks: 40000 }];
  it('allows zero lunch and a half-hour exception without rounding hours', () => {
    expect(calculateWorkDay(intervals, rates, 'Europe/Moscow', 0).amountKopecks).toBe(280000);
    const result = calculateWorkDay(intervals, rates, 'Europe/Moscow', 30);
    expect(result.lunchMs).toBe(1800000);
    expect(result.amountKopecks).toBe(262500);
    expect(result.segments.map(s => s.paidMs)).toEqual([13500000, 13500000]);
  });
  it('retains the automatic rule and rejects impossible lunch', () => {
    expect(calculateWorkDay(intervals, rates).lunchMs).toBe(3600000);
    expect(() => calculateWorkDay(intervals, rates, 'Europe/Moscow', 481)).toThrow();
    expect(() => calculateWorkDay(intervals, rates, 'Europe/Moscow', -1)).toThrow();
  });
});
