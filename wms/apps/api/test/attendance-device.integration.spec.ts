import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AttendanceDeviceService, ATTENDANCE_RETENTION } from '../src/modules/expenses/attendance-device.service';
import { PayrollService } from '../src/modules/expenses/payroll.service';
import type { AuthUser } from '../src/modules/auth/auth.types';

const url = process.env.ATTENDANCE_TEST_DATABASE_URL;
if (url && url !== 'postgresql://codex_payroll@127.0.0.1:55487/payroll_tests') throw Error('Dedicated local attendance test database only');
// TEST: real PostgreSQL uniqueness/row locks, actual payroll records, restricted photo access.
describe.skipIf(!url).sequential('tablet attendance PostgreSQL', () => {
  let db: PrismaClient, service: AttendanceDeviceService, warehouseId: string, employeeId: string;
  let user: AuthUser, first: Awaited<ReturnType<AttendanceDeviceService['register']>>, second: typeof first;
  const previous = [process.env.WMS_PAYROLL_ATTENDANCE_ENABLED, process.env.WMS_ATTENDANCE_DEVICE_ENABLED];
  const auth = () => `Bearer ${first.token}`;
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAAr/2Q==', 'base64');
  const digest = createHash('sha256').update(jpeg).digest('hex');
  const mark = (kind = 'CLOCK_IN', time = Date.now() - 600000, device = first, person = employeeId) => ({
    protocolVersion: 2, photoPolicy: 'LOCAL_35_DAYS', eventId: randomUUID(), employeeId: person, deviceId: device.deviceId, warehouseId,
    kind, capturedAtMs: time, elapsedAtMs: 1000, serverOffsetMs: 0, lastSyncAtMs: time - 1000, photoSha256: digest, payload: {},
  });
  const send = (m: ReturnType<typeof mark>, token = auth()) => service.event(token, m.eventId, m);
  beforeAll(async () => {
    process.env.WMS_PAYROLL_ATTENDANCE_ENABLED = 'true'; process.env.WMS_ATTENDANCE_DEVICE_ENABLED = 'true';
    db = new PrismaClient({ datasources: { db: { url: url! } } });
    const present = await db.$queryRaw<Array<{ table: string | null }>>`SELECT to_regclass('"AttendanceDevice"')::text AS "table"`;
    if (!present[0].table) {
      const sql = readFileSync('prisma/migrations/20260927010000_attendance_devices/migration.sql', 'utf8');
      for (const statement of sql.split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement);
    }
    // The isolated payroll fixture contains only payroll tables; add the real Warehouse scalar columns.
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Warehouse" (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, city TEXT DEFAULT 'Москва', address TEXT, "ownCompanyId" TEXT, "isActive" BOOLEAN DEFAULT true, "sortOrder" INT DEFAULT 100, "createdAt" TIMESTAMP(3) DEFAULT NOW(), "updatedAt" TIMESTAMP(3) DEFAULT NOW())`);
    warehouseId = randomUUID(); employeeId = randomUUID();
    await db.warehouse.create({ data: { id: warehouseId, code: warehouseId, name: 'Tablet test warehouse' } });
    await db.payrollEmployee.create({ data: { id: employeeId, warehouseId, name: 'Tablet employee', loader: true } });
    user = { id: 'test-admin', roleCodes: ['ADMIN'], warehouseIds: [warehouseId], writableWarehouseIds: [warehouseId] } as AuthUser;
    service = new AttendanceDeviceService(db as never);
    const connect = async (name: string) => { const c = await service.issue(user, warehouseId); return service.register({ code: c.code, name, protocolVersion: 2 }, 'test-' + name); };
    first = await connect('first'); second = await connect('second');
  });
  afterAll(async () => {
    service?.onModuleDestroy(); await db?.$disconnect();
    ['WMS_PAYROLL_ATTENDANCE_ENABLED', 'WMS_ATTENDANCE_DEVICE_ENABLED'].forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i];
    });
  });
  it('consumes a one-time registration code atomically', async () => {
    const c = await service.issue(user, warehouseId);
    const result = await Promise.allSettled([1, 2].map(i => service.register({ code: c.code, name: `race${i}`, protocolVersion: 2 }, `race${i}`)));
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rows = await service.devices(user); expect(JSON.stringify(rows)).not.toContain('tokenHash');
  });
  it('creates one shift when two devices race and returns a stable replay', async () => {
    const a = mark(), b = mark('CLOCK_IN', a.capturedAtMs, second);
    const results = await Promise.all([send(a), send(b, `Bearer ${second.token}`)]);
    expect(results.map(r => r.status).sort()).toEqual(['ACCEPTED', 'REVIEW']);
    expect(await db.payrollShift.count({ where: { employeeId, endsAt: null } })).toBe(1);
    expect(await send(a)).toEqual(results[0]);
    expect(await send(b, `Bearer ${second.token}`)).toEqual(results[1]);
    await expect(send({ ...a, capturedAtMs: a.capturedAtMs + 1 })).rejects.toThrow('других данных');
    expect(results[0].photoStored).toBe(false);
  });
  it('closes on a different tablet without a photo and accepts multiple daily intervals', async () => {
    const out = mark('CLOCK_OUT', Date.now() - 500000, second);
    expect((await send(out, `Bearer ${second.token}`)).status).toBe('ACCEPTED');
    const next = mark('CLOCK_IN', Date.now() - 400000);
    expect((await send(next)).status).toBe('ACCEPTED');
    expect((await send(mark('CLOCK_OUT', Date.now() - 300000))).status).toBe('ACCEPTED');
    expect(await db.payrollShift.count({ where: { employeeId } })).toBe(2);
  });
  it('separates employee state from financial information and receipts can be acknowledged', async () => {
    const state = await service.state(auth());
    expect(state.employees).toHaveLength(1);
    expect(JSON.stringify(state)).not.toMatch(/paymentPhone|paymentBank|rateKopecks|tokenHash/);
    const ids = state.receipts.filter(r => r.status === 'ACCEPTED').map(r => r.eventId);
    await service.acknowledge(auth(), { eventIds: ids });
    expect((await service.state(auth())).receipts.filter(r => ids.includes(r.eventId))).toHaveLength(0);
    expect((await service.state(auth())).employees[0].revision).toBeGreaterThan(state.employees[0].revision);
  });
  it('requires an explicit scoped photo request and keeps attendance independent', async () => {
    const m = mark('CLOCK_IN', Date.now() - 200000); await send(m);
    expect((await service.state(auth())).photoRequests).toHaveLength(0);
    await expect(service.requestPhoto({ ...user, warehouseIds: ['foreign'], writableWarehouseIds: ['foreign'] }, m.eventId)).rejects.toThrow();
    const request = await service.requestPhoto(user, m.eventId);
    const file = { buffer: jpeg } as Express.Multer.File;
    await expect(service.uploadPhoto(`Bearer ${second.token}`, request.id, request.id, { requestId: request.id, eventId: m.eventId, status: 'AVAILABLE' }, file)).rejects.toThrow();
    const result = await service.uploadPhoto(auth(), request.id, request.id, { requestId: request.id, eventId: m.eventId, status: 'AVAILABLE' }, file);
    expect(result.status).toBe('STORED'); expect(Buffer.from(await service.photo(user, m.eventId))).toEqual(jpeg);
    expect((await service.state(auth())).photoRequests).toHaveLength(0);
    await expect(service.photo({ ...user, warehouseIds: ['foreign'] }, m.eventId)).rejects.toThrow();
    await db.$executeRaw`UPDATE "AttendancePhotoRequest" SET "expiresAt" = NOW() - INTERVAL '1 second' WHERE id = ${request.id}`;
    await expect(service.photo(user, m.eventId)).rejects.toThrow();
    await service.cleanup();
    const rows = await db.$queryRaw<Array<{ photo: Buffer | null; status: string }>>`SELECT photo, status FROM "AttendancePhotoRequest" WHERE id = ${request.id}`;
    expect(rows[0]).toEqual({ photo: null, status: 'EXPIRED' });
    expect((await send(m)).status).toBe('ACCEPTED');
  });
  it('rejects corrupted JPEG and never exposes a public photo URL', async () => {
    const m = mark('CLOCK_OUT', Date.now() - 100000); await send(m);
    const p = await service.requestPhoto(user, m.eventId);
    await expect(service.uploadPhoto(auth(), p.id, p.id, { requestId: p.id, eventId: m.eventId, status: 'AVAILABLE' }, { buffer: Buffer.from('bad') } as Express.Multer.File)).rejects.toThrow('изображение');
    expect((await service.state(auth())).photoRequests.some(r => r.eventId === m.eventId)).toBe(true);
  });
  it('places conflicting clock time on review and allows audited dismissal', async () => {
    const m = mark('CLOCK_IN', Date.now() + 86400000);
    expect((await send(m)).status).toBe('REVIEW');
    const r = await service.resolve(user, m.eventId, { action: 'DISMISS', reason: 'Wrong device clock', effectiveAt: new Date().toISOString() });
    expect(r.status).toBe('ACCEPTED'); expect(r.reason).toContain('Отклонено');
    expect(await db.payrollShift.count({ where: { employeeId, endsAt: null } })).toBe(0);
    expect((await service.state(auth())).receipts.some(r => r.eventId === m.eventId)).toBe(true);
  });
  it('preserves historical and paid days without adding tablet shifts', async () => {
    const person = randomUUID(); await db.payrollEmployee.create({ data: { id: person, name: 'Historical', warehouseId } });
    const m = mark('CLOCK_IN', Date.now() - 86400000, first, person);
    const day = new Date(m.capturedAtMs + 3 * 3600000).toISOString().slice(0, 10);
    await db.payrollHistorical.create({ data: { key: randomUUID(), employeeId: person, warehouseId, workDate: day, amountKopecks: 100, status: 'PAID', data: {}, sourceHash: 'test', createdById: 'test' } });
    expect((await send(m)).reason).toContain('импортирован');
    expect(await db.payrollShift.count({ where: { employeeId: person } })).toBe(0);
  });
  it('stores one loading operation for replay with no automatic payment', async () => {
    const m = { ...mark('HANDLING'), photoSha256: '', payload: { type: 'UNLOADING', startsAtMs: Date.now() - 60000, pallets: '1.25', participantIds: [employeeId], comment: 'test' } };
    expect((await send(m)).status).toBe('ACCEPTED'); await send(m);
    const row = await db.payrollHandling.findUniqueOrThrow({ where: { id: m.eventId }, include: { shares: true } });
    expect(row.status).toBe('REVIEW'); expect(row.shares[0].amountKopecks).toBeNull(); expect(row.palletCount.toString()).toBe('1.25');
  });
  it('expires photo requests without blocking an old offline mark', async () => {
    const person = randomUUID(); await db.payrollEmployee.create({ data: { id: person, name: 'Offline', warehouseId } });
    const m = mark('CLOCK_IN', Date.now() - ATTENDANCE_RETENTION - 1000, first, person);
    expect((await send(m)).status).toBe('ACCEPTED'); expect((await service.requestPhoto(user, m.eventId)).status).toBe('EXPIRED');
  });
  // TEST: employee and initial tariffs are one atomic write; invalid tariffs leave no orphan card.
  it('creates an employee with hourly and pallet rates together', async () => {
    const payroll = new PayrollService(db as never);
    const dto = { name: 'Initial rates test', warehouseId, picker: true, loader: true, isActive: true, paymentMethod: 'CASH',
      initialConditions: [{ kind: 'HOURLY', rateKopecks: 35000, startsAt: '2026-09-28T00:00:00+03:00' }, { kind: 'PALLET', rateKopecks: 50000, startsAt: '2026-09-28T00:00:00+03:00' }] };
    const employee = await payroll.saveEmployee(undefined, dto, user);
    expect(await db.payrollCondition.findMany({ where: { employeeId: employee.id }, orderBy: { kind: 'asc' } })).toMatchObject([
      { kind: 'HOURLY', rateKopecks: 35000, temporary: false }, { kind: 'PALLET', rateKopecks: 50000, temporary: false }]);
    await expect(payroll.saveEmployee(undefined, { ...dto, name: 'Invalid initial tariff', initialConditions: [{ ...dto.initialConditions[0], rateKopecks: -1 }] }, user)).rejects.toThrow('тариф');
    expect(await db.payrollEmployee.count({ where: { warehouseId, name: 'Invalid initial tariff' } })).toBe(0);
    await expect(payroll.saveEmployee(employee.id, dto, user)).rejects.toThrow('условия оплаты');
  });
  // TEST: admin cancellation clears tablet state without replay resurrecting the cancelled arrival.
  it('keeps cancelled tablet arrivals out of state and overlap checks', async () => {
    const person = randomUUID(); await db.payrollEmployee.create({ data: { id: person, name: 'Cancelled arrival', warehouseId } });
    const m = mark('CLOCK_IN', Date.now() - 120000, first, person);
    expect((await send(m)).status).toBe('ACCEPTED');
    const payroll = new PayrollService(db as never);
    await payroll.cancelShift(person, m.eventId, 'Test cancellation', user);
    expect((await service.state(auth())).employees.find(e => e.id === person)?.openSinceMs).toBeNull();
    await send(m);
    expect((await service.state(auth())).employees.find(e => e.id === person)?.openSinceMs).toBeNull();
    expect((await send(mark('CLOCK_IN', Date.now() - 60000, first, person))).status).toBe('ACCEPTED');
  });
  it('denies revoked devices and keeps the new module disabled on sold WMS', async () => {
    await service.revoke(user, second.deviceId);
    await expect(service.state(`Bearer ${second.token}`)).rejects.toThrow('отозван');
    process.env.WMS_ATTENDANCE_DEVICE_ENABLED = 'false';
    try { await expect(service.state(auth())).rejects.toThrow('не включён'); } finally { process.env.WMS_ATTENDANCE_DEVICE_ENABLED = 'true'; }
  });
});
