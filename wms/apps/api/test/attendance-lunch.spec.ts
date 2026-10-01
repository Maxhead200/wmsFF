import 'reflect-metadata';
import { expect, it } from 'vitest';
import { calculateWorkDay } from '../src/modules/expenses/payroll-calculation';

// TEST: actual breaks replace the automatic hour and respect rates at the time of absence.
it('deducts actual lunch across midnight without rounding or a second automatic deduction', () => {
  const shifts = [{ start: '2026-10-01T18:00:00+03:00', end: '2026-10-02T02:00:00+03:00' }];
  const pauses = [{ start: '2026-10-01T23:50:00+03:00', end: '2026-10-02T00:30:30+03:00' }];
  expect(calculateWorkDay(shifts, [{ from: shifts[0].start, kopecks: 36000 }], 'Europe/Moscow', undefined, pauses))
    .toMatchObject({ workedMs: 28800000, lunchMs: 2430000, paidMs: 26370000, amountKopecks: 263700 });
});
it('rejects overlapping or out-of-shift lunch intervals', () => {
  const shifts = [{ start: '2026-10-01T09:00:00Z', end: '2026-10-01T18:00:00Z' }];
  const rates = [{ from: shifts[0].start, kopecks: 10000 }];
  const pause = { start: '2026-10-01T12:00:00Z', end: '2026-10-01T13:00:00Z' };
  expect(() => calculateWorkDay(shifts, rates, 'Europe/Moscow', undefined, [pause, pause])).toThrow();
  expect(() => calculateWorkDay(shifts, rates, 'Europe/Moscow', undefined, [{ ...pause, end: '2026-10-01T19:00:00Z' }])).toThrow();
});
