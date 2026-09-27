import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PayrollService } from '../src/modules/expenses/payroll.service';
import type { AuthUser } from '../src/modules/auth/auth.types';

const url = process.env.PAYROLL_TEST_DATABASE_URL;
if (url && url !== 'postgresql://codex_payroll@127.0.0.1:55487/payroll_tests') throw new Error('Dedicated local payroll test database only');
// TEST: actual row locks and immutable paid snapshots, on an isolated local database.
describe.skipIf(!url).sequential('payroll PostgreSQL transactions', () => {
  let db: PrismaClient, service: PayrollService, employeeId: string;
  const user = { id: 'test-admin', roleCodes: ['ADMIN'], warehouseIds: ['test-branch'], writableWarehouseIds: ['test-branch'] } as AuthUser;
  const previousFlag = process.env.WMS_PAYROLL_ATTENDANCE_ENABLED;
  beforeAll(async () => {
    process.env.WMS_PAYROLL_ATTENDANCE_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: url! } } });
    service = new PayrollService(db as never);
    employeeId = randomUUID();
    await db.payrollEmployee.create({ data: { id: employeeId, name: 'Local payroll test', warehouseId: 'test-branch' } });
    await service.addCondition(employeeId, { kind: 'HOURLY', rateKopecks: 35000, startsAt: '2026-01-01T00:00:00+03:00', temporary: false, reason: 'test' }, user);
  });
  afterAll(async () => {
    await db?.$disconnect();
    if (previousFlag === undefined) delete process.env.WMS_PAYROLL_ATTENDANCE_ENABLED; else process.env.WMS_PAYROLL_ATTENDANCE_ENABLED = previousFlag;
  });
  it('serializes concurrent attempts to add the same attendance interval', async () => {
    const dto = { startsAt: '2026-09-26T09:00:00+03:00', endsAt: '2026-09-26T17:00:00+03:00', reason: 'test' };
    const results = await Promise.allSettled([service.addShift(employeeId, dto, user), service.addShift(employeeId, dto, user)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.payrollShift.count({ where: { employeeId } })).toBe(1);
  });
  it('freezes the paid amount across later rate changes and overlapping report periods', async () => {
    const report = await service.report(employeeId, '2026-09-26', '2026-09-26', user);
    expect(report.rows[0].amountKopecks).toBe(245000);
    await service.setStatus({ employeeId, dateFrom: '2026-09-26', dateTo: '2026-09-26', keys: [report.rows[0].key], status: 'PAID', comment: 'test' }, user);
    await service.addCondition(employeeId, { kind: 'HOURLY', rateKopecks: 50000, startsAt: '2026-09-26T00:00:00+03:00', endsAt: '2026-09-27T00:00:00+03:00', temporary: true, reason: 'test' }, user);
    const next = await service.report(employeeId, '2026-09-01', '2026-09-30', user);
    expect(next.rows[0].amountKopecks).toBe(245000); expect(next.rows[0].status).toBe('PAID');
  });
  it('denies a different branch even with a valid employee identifier', async () => {
    await expect(service.report(employeeId, '2026-09-01', '2026-09-30', { ...user, warehouseIds: ['other'] })).rejects.toThrow('не найден');
  });
  // TEST: one-off tariffs, draft correction and cancellation survive actual DB writes without altering personal rates.
  it('corrects and confirms handling without a pallet condition, then excludes a cancelled operation', async () => {
    const dto = { warehouseId: 'test-branch', startsAt: '2026-09-27T10:00:00+03:00', operation: 'UNLOAD', palletCount: 5, employeeIds: [employeeId], reason: 'Local test' };
    const op = await service.addHandling(dto, user);
    await service.changeHandling(op.id, { ...dto, palletCount: 4 }, user);
    await service.confirmHandling(op.id, user, 50000);
    const report = await service.report(employeeId, '2026-09-27', '2026-09-27', user);
    expect(report.rows.find(r => r.key === `HANDLING:${op.id}:${employeeId}`)?.amountKopecks).toBe(200000);
    expect(await db.payrollCondition.count({ where: { employeeId, kind: 'PALLET' } })).toBe(0);
    const cancelled = await service.addHandling(dto, user);
    await service.changeHandling(cancelled.id, { reason: 'Test cancellation' }, user, true);
    const after = await service.report(employeeId, '2026-09-27', '2026-09-27', user);
    expect(after.rows.some(r => r.key.includes(cancelled.id))).toBe(false);
    expect(await db.payrollHandling.findUnique({ where: { id: cancelled.id } })).toMatchObject({ status: 'CANCELLED' });
    expect(await db.payrollAudit.count({ where: { entityId: cancelled.id, action: 'HANDLING_CANCELLED' } })).toBe(1);
  });
  // TEST: simultaneous admin actions must not both succeed or leave payable cancelled work.
  it('serializes confirmation versus cancellation', async () => {
    const op = await service.addHandling({ warehouseId: 'test-branch', startsAt: '2026-09-28T10:00:00+03:00', operation: 'LOAD', palletCount: 1, employeeIds: [employeeId], reason: 'Race test' }, user);
    const results = await Promise.allSettled([service.confirmHandling(op.id, user, 50000), service.changeHandling(op.id, { reason: 'Race cancellation' }, user, true)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const saved = await db.payrollHandling.findUniqueOrThrow({ where: { id: op.id }, include: { shares: true } });
    expect(saved.shares[0].amountKopecks).toBe(saved.status === 'CONFIRMED' ? 50000 : null);
  });
});
