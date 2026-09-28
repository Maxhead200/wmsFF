import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PayrollService } from '../src/modules/expenses/payroll.service';
import type { AuthUser } from '../src/modules/auth/auth.types';
const user = { id: 'admin', roleCodes: ['ADMIN'], warehouseIds: ['msk'], writableWarehouseIds: ['msk'] } as AuthUser;
function setup(status = 'REVIEW') {
  const shares = ['a', 'b'].map(employeeId => ({ employeeId, employee: { id: employeeId, name: employeeId, rates: [] } }));
  const row = { id: 'op', warehouseId: 'msk', startsAt: new Date('2026-09-27T17:42:00Z'), palletCount: 5, status, shares };
  const db: any = { $queryRaw: vi.fn(), payrollEmployee: { findFirst: vi.fn().mockResolvedValue({ warehouseId: 'msk' }) },
    payrollHandling: { findUnique: vi.fn().mockResolvedValue(row), update: vi.fn().mockResolvedValue(row) },
    payrollHandlingShare: { update: vi.fn() }, payrollAudit: { create: vi.fn() } };
  db.$transaction = (fn: (tx: any) => any) => fn(db);
  return { db, service: new PayrollService(db) };
}
// TEST: tablet handling without employee pallet rates can be confirmed using a one-off operation tariff.
describe('handling review actions', () => {
  beforeEach(() => vi.stubEnv('WMS_PAYROLL_ATTENDANCE_ENABLED', 'true'));
  afterEach(() => vi.unstubAllEnvs());
  it('splits 5 pallets at 500 RUB between two participants and audits the actual tariff', async () => {
    const { db, service } = setup(); await service.confirmHandling('op', user, 50000);
    expect(db.payrollHandlingShare.update).toHaveBeenCalledTimes(2);
    for (const [call] of db.payrollHandlingShare.update.mock.calls) expect(call.data.amountKopecks).toBe(125000);
    expect(db.payrollAudit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      action: 'HANDLING_CONFIRMED', details: expect.objectContaining({ totalKopecks: 250000 }) }) }));
  });
  it('gives an actionable error when neither personal nor one-off tariff exists', async () => {
    const { db, service } = setup(); await expect(service.confirmHandling('op', user)).rejects.toThrow('Введите разовый тариф');
    expect(db.payrollHandling.update).not.toHaveBeenCalled();
  });
  it('cancels only a review operation and retains its audit trail', async () => {
    const { db, service } = setup(); await service.changeHandling('op', { reason: 'Ошибочная запись' }, user, true);
    expect(db.payrollHandling.update).toHaveBeenCalledWith({ where: { id: 'op' }, data: { status: 'CANCELLED' } });
    expect(db.payrollAudit.create).toHaveBeenCalled();
  });
  it('does not reconfirm a cancelled operation', async () => {
    const { db, service } = setup('CANCELLED'); await expect(service.confirmHandling('op', user, 50000)).rejects.toThrow('Отменённую');
    expect(db.payrollHandlingShare.update).not.toHaveBeenCalled();
  });
  it('protects confirmed operations from edits', async () => {
    const { service } = setup('CONFIRMED'); await expect(service.changeHandling('op', { reason: 'test' }, user, true)).rejects.toThrow('неподтверждённую');
  });
  it('updates participants and count under the operation lock', async () => {
    const { db, service } = setup(); await service.changeHandling('op', { warehouseId: 'msk', startsAt: '2026-09-27T17:00:00Z', operation: 'UNLOAD', palletCount: 3, employeeIds: ['a'], reason: 'Исправлено количество' }, user);
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.payrollHandling.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ palletCount: 3, shares: { deleteMany: {}, create: [{ employeeId: 'a' }] } }) }));
  });
  it('rejects cross-branch access before writes', async () => {
    const { db, service } = setup(); db.payrollEmployee.findFirst.mockResolvedValue(null);
    await expect(service.confirmHandling('op', user, 50000)).rejects.toThrow();
    expect(db.payrollHandling.update).not.toHaveBeenCalled();
  });
});
