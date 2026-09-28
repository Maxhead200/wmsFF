import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma, PayrollEmployee } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { payrollWarehouses } from './payroll.service';
import { workDate } from './payroll-calculation';

type Tx = Prisma.TransactionClient;
type Device = { id: string; warehouseId: string; isDemo: boolean; name: string; revokedAt: Date | null };
type Mark = { protocolVersion: number; photoPolicy: string; eventId: string; employeeId: string; deviceId: string; warehouseId: string;
  kind: string; capturedAtMs: number; elapsedAtMs: number; serverOffsetMs: number | null; lastSyncAtMs: number | null; photoSha256: string | null; payload: Record<string, unknown> };
type Entry = { id: string; deviceId: string; employeeId: string; warehouseId: string; isDemo: boolean; kind: string; fingerprint: string; data: Mark; effectiveAt: Date; status: string; reason: string; result: Prisma.JsonObject };
type Photo = { id: string; eventId: string; deviceId: string; expiresAt: Date; status: string; photo: Buffer | null };
export const ATTENDANCE_RETENTION = 35 * 86400000;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function fail(message = 'Некорректные данные.'): never { throw new BadRequestException(message); }
const text = (v: unknown, max = 100): string => typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : fail();
const uuid = (v: unknown) => { const s = text(v); return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : fail('Неверный ID.'); };
const millis = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v < 8e15 ? v : fail('Неверное время.');
const canonical = (v: unknown): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v && typeof v === 'object'
  ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}' : JSON.stringify(v);

// FIX: validate v2 metadata independently of photos. Photos cannot gate the timesheet.
export function attendanceMark(input: Record<string, unknown>, key: string | undefined): Mark {
  if (!input || JSON.stringify(input).length > 12000 || input.protocolVersion !== 2 || input.photoPolicy !== 'LOCAL_35_DAYS') fail('Требуется протокол планшета v2.');
  const id = uuid(input.eventId);
  if (key !== id || !['CLOCK_IN', 'CLOCK_OUT', 'HANDLING'].includes(String(input.kind))) fail();
  const photo = input.photoSha256;
  if (input.kind !== 'HANDLING' && (typeof photo !== 'string' || !/^[a-f0-9]{64}$/.test(photo))) fail('Не указан хеш локального фото.');
  if (!Number.isSafeInteger(input.elapsedAtMs) || Number(input.elapsedAtMs) < 0) fail();
  if (input.serverOffsetMs !== null && !Number.isSafeInteger(input.serverOffsetMs)) fail();
  if (input.lastSyncAtMs !== null) millis(input.lastSyncAtMs);
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) fail();
  return { protocolVersion: 2, photoPolicy: 'LOCAL_35_DAYS', eventId: id, employeeId: uuid(input.employeeId), deviceId: uuid(input.deviceId),
    warehouseId: text(input.warehouseId), kind: String(input.kind), capturedAtMs: millis(input.capturedAtMs), elapsedAtMs: Number(input.elapsedAtMs),
    serverOffsetMs: input.serverOffsetMs as number | null, lastSyncAtMs: input.lastSyncAtMs as number | null,
    photoSha256: input.kind === 'HANDLING' ? null : photo as string, payload: input.payload as Record<string, unknown> };
}

@Injectable()
export class AttendanceDeviceService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private readonly prisma: PrismaService) {}
  enabled() { return process.env.WMS_PAYROLL_ATTENDANCE_ENABLED === 'true' && process.env.WMS_ATTENDANCE_DEVICE_ENABLED === 'true'; }
  private gate() { if (!this.enabled()) throw new NotFoundException('API планшетов не включён.'); }
  onModuleInit() {
    if (!this.enabled()) return;
    const clean = () => { void this.cleanup().catch(() => { /* Next bounded cleanup retries; never log images/tokens. */ }); };
    clean(); this.timer = setInterval(clean, 60000); this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async cleanup() { this.gate(); await this.prisma.$executeRaw`UPDATE "AttendancePhotoRequest" SET photo = NULL, status = 'EXPIRED' WHERE "expiresAt" <= NOW() AND status <> 'EXPIRED'`; }
  private scope(user: AuthUser, write = false) {
    this.gate(); const ids = payrollWarehouses(user, write);
    return { isDemo: Boolean(user.isDemo), ...(ids ? { warehouseId: { in: ids } } : {}) };
  }
  private access(user: AuthUser, row: { warehouseId: string; isDemo: boolean }, write = false) {
    this.scope(user, write); const ids = payrollWarehouses(user, write);
    if (row.isDemo !== Boolean(user.isDemo) || (ids && !ids.includes(row.warehouseId))) throw new NotFoundException('Запись не найдена.');
  }
  private throttle(ip: string) {
    const now = Date.now(); for (const [k, v] of this.attempts) if (v.until <= now) this.attempts.delete(k);
    if (this.attempts.size >= 4096 && !this.attempts.has(ip)) throw new HttpException('Повторите позже.', 429);
    const a = this.attempts.get(ip) ?? { count: 0, until: now + 60000 }; a.count++; this.attempts.set(ip, a);
    if (a.count > 15) throw new HttpException('Повторите позже.', 429);
  }
  async issue(user: AuthUser, warehouse: unknown) {
    this.scope(user, true); const warehouseId = text(warehouse);
    this.access(user, { warehouseId, isDemo: Boolean(user.isDemo) }, true);
    if (!await this.prisma.warehouse.findFirst({ where: { id: warehouseId, isActive: true } })) fail('Филиал недоступен.');
    const code = randomBytes(12).toString('hex').toUpperCase(), digest = hash(code), expiresAt = new Date(Date.now() + 15 * 60000);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "AttendanceCode" (hash, "warehouseId", "isDemo", "createdById", "expiresAt") VALUES (${digest}, ${warehouseId}, ${Boolean(user.isDemo)}, ${user.id}, ${expiresAt})`;
      await this.audit(tx, warehouseId, user.id, warehouseId, 'TABLET_CODE_ISSUED', {});
    });
    return { code, expiresAt };
  }
  async register(body: Record<string, unknown>, ip: string) {
    this.gate(); this.throttle(ip);
    if (body?.protocolVersion !== 2) fail('Обновите приложение до протокола v2.');
    const digest = hash(text(body.code).toUpperCase()), name = text(body.name, 80), id = randomUUID(), token = randomBytes(32).toString('hex');
    return this.prisma.$transaction(async tx => {
      const codes = await tx.$queryRaw<Array<{ warehouseId: string; isDemo: boolean; createdById: string }>>`UPDATE "AttendanceCode" SET "usedAt" = NOW() WHERE hash = ${digest} AND "usedAt" IS NULL AND "expiresAt" > NOW() RETURNING "warehouseId", "isDemo", "createdById"`;
      const c = codes[0]; if (!c) throw new UnauthorizedException('Код недействителен или истёк.');
      const warehouse = await tx.warehouse.findFirst({ where: { id: c.warehouseId, isActive: true } });
      if (!warehouse) throw new ForbiddenException('Филиал недоступен.');
      await tx.$executeRaw`INSERT INTO "AttendanceDevice" (id, "warehouseId", "isDemo", name, "tokenHash", "createdById") VALUES (${id}, ${c.warehouseId}, ${c.isDemo}, ${name}, ${hash(token)}, ${c.createdById})`;
      await this.audit(tx, c.warehouseId, c.createdById, id, 'TABLET_REGISTERED', { name });
      return { protocolVersion: 2, deviceId: id, warehouseId: c.warehouseId, warehouseName: warehouse.name, token };
    });
  }
  private async device(tx: Tx, auth: string | undefined) {
    this.gate(); const token = auth?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) throw new UnauthorizedException('Недействительный токен планшета.');
    const rows = await tx.$queryRaw<Device[]>`SELECT id, "warehouseId", "isDemo", name, "revokedAt" FROM "AttendanceDevice" WHERE "tokenHash" = ${hash(token)} FOR UPDATE`;
    const d = rows[0]; if (!d || d.revokedAt) throw new UnauthorizedException('Доступ планшета отозван.');
    if (!await tx.warehouse.findFirst({ where: { id: d.warehouseId, isActive: true } })) throw new ForbiddenException('Филиал недоступен.');
    await tx.$executeRaw`UPDATE "AttendanceDevice" SET "lastSeenAt" = NOW() WHERE id = ${d.id}`;
    return d;
  }
  private async employeeState(tx: Tx, e: PayrollEmployee) {
    const shift = await tx.payrollShift.findFirst({ where: { employeeId: e.id, cancelledAt: null, endsAt: null }, orderBy: { startsAt: 'desc' } });
    const seq = await tx.$queryRaw<Array<{ revision: bigint }>>`SELECT nextval('"AttendanceRevision"') AS revision`;
    return { id: e.id, name: e.name, warehouseId: e.warehouseId, loader: e.loader, active: e.isActive, distinguishing: '',
      openSinceMs: shift?.startsAt.getTime() ?? null, revision: Number(seq[0].revision) };
  }
  async state(auth: string | undefined) {
    return this.prisma.$transaction(async tx => {
      const d = await this.device(tx, auth);
      const employees = await tx.payrollEmployee.findMany({ where: { warehouseId: d.warehouseId, isDemo: d.isDemo, isActive: true }, orderBy: { name: 'asc' } });
      const receipts = await tx.$queryRaw<Array<{ result: Prisma.JsonObject }>>`SELECT result FROM "AttendanceEvent" WHERE "deviceId" = ${d.id} AND acknowledged = false ORDER BY status, "receivedAt", id LIMIT 100`;
      const photoRequests = await tx.$queryRaw<Array<{ requestId: string; eventId: string }>>`SELECT id AS "requestId", "eventId" FROM "AttendancePhotoRequest" WHERE "deviceId" = ${d.id} AND status = 'PENDING' AND "expiresAt" > NOW() ORDER BY "requestedAt" LIMIT 100`;
      const states = []; for (const e of employees) states.push(await this.employeeState(tx, e));
      return { protocolVersion: 2, deviceId: d.id, warehouseId: d.warehouseId, serverTimeMs: Date.now(), employees: states, receipts: receipts.map(r => r.result), photoRequests };
    }, { timeout: 20000 });
  }
  async acknowledge(auth: string | undefined, body: Record<string, unknown>) {
    const ids = body?.eventIds; if (!Array.isArray(ids) || ids.length > 100) fail();
    const valid = (ids as unknown[]).map(uuid);
    return this.prisma.$transaction(async tx => {
      const d = await this.device(tx, auth);
      if (valid.length) await tx.$executeRaw`UPDATE "AttendanceEvent" SET acknowledged = true WHERE "deviceId" = ${d.id} AND status = 'ACCEPTED' AND id IN (${Prisma.join(valid)})`;
      return { ok: true };
    });
  }
  async event(auth: string | undefined, key: string | undefined, body: Record<string, unknown>) {
    this.gate(); const m = attendanceMark(body, key), fingerprint = hash(canonical(m));
    return this.prisma.$transaction(async tx => {
      const d = await this.device(tx, auth);
      if (m.deviceId !== d.id || m.warehouseId !== d.warehouseId) throw new ForbiddenException('Неверная привязка.');
      // Serialize the id across devices before checking the replay; never catch a failed INSERT inside a transaction.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${m.eventId}, 0))::text`;
      const previous = (await tx.$queryRaw<Entry[]>`SELECT * FROM "AttendanceEvent" WHERE id = ${m.eventId}`)[0];
      if (previous) {
        if (previous.deviceId !== d.id || previous.fingerprint !== fingerprint) throw new ConflictException('ID уже использован для других данных.');
        return previous.result;
      }
      const e = await this.lockEmployee(tx, m.employeeId, d);
      const offset = m.serverOffsetMs ?? 0;
      const effectiveAt = new Date(m.capturedAtMs + (Math.abs(offset) <= 86400000 ? offset : 0));
      if (!Number.isFinite(effectiveAt.getTime())) fail();
      let reason = !e.isActive ? 'Сотрудник неактивен.' : m.serverOffsetMs === null || m.lastSyncAtMs === null || Math.abs(offset) > 86400000
        || m.lastSyncAtMs > m.capturedAtMs + 300000 || effectiveAt.getTime() > Date.now() + 300000 ? 'Проверьте время отметки.' : '';
      if (!reason) reason = await this.apply(tx, d, e, m, effectiveAt);
      const status = reason ? 'REVIEW' : 'ACCEPTED';
      const result = { eventId: m.eventId, status, reason, photoStored: false, employee: await this.employeeState(tx, e) };
      await tx.$executeRaw`INSERT INTO "AttendanceEvent" (id, "deviceId", "employeeId", "warehouseId", "isDemo", kind, fingerprint, data, "effectiveAt", status, reason, result) VALUES (${m.eventId}, ${d.id}, ${e.id}, ${d.warehouseId}, ${d.isDemo}, ${m.kind}, ${fingerprint}, ${JSON.stringify(m)}::jsonb, ${effectiveAt}, ${status}, ${reason}, ${JSON.stringify(result)}::jsonb)`;
      await this.audit(tx, d.warehouseId, `device:${d.id}`, m.eventId, 'TABLET_EVENT', { status, kind: m.kind });
      return result;
    }, { timeout: 20000 });
  }
  private async lockEmployee(tx: Tx, id: string, d: Pick<Device, 'warehouseId' | 'isDemo'>) {
    await tx.$queryRaw`SELECT id FROM "PayrollEmployee" WHERE id = ${id} FOR UPDATE`;
    const e = await tx.payrollEmployee.findFirst({ where: { id, warehouseId: d.warehouseId, isDemo: d.isDemo } });
    if (!e) throw new NotFoundException('Сотрудник недоступен.');
    return e;
  }
  private async apply(tx: Tx, d: Pick<Device, 'id' | 'warehouseId' | 'isDemo'>, e: PayrollEmployee, m: Mark, at: Date): Promise<string> {
    if (m.kind === 'HANDLING') {
      const p = m.payload, ids = p.participantIds;
      if (!e.loader || !['LOADING', 'UNLOADING'].includes(String(p.type)) || typeof p.pallets !== 'string' || !/^\d{1,5}(\.\d{1,4})?$/.test(p.pallets)
        || Number(p.pallets) <= 0 || Number(p.pallets) > 10000 || !Array.isArray(ids) || ids.length > 100 || !ids.includes(e.id)
        || new Set(ids).size !== ids.length || typeof p.comment !== 'string' || p.comment.length > 1000) return 'Проверьте данные погрузки.';
      const start = new Date(millis(p.startsAtMs)); if (start.getTime() > Date.now() + 300000) return 'Проверьте время погрузки.';
      const members = await tx.payrollEmployee.findMany({ where: { id: { in: ids.map(uuid) }, warehouseId: d.warehouseId, isDemo: d.isDemo, isActive: true } });
      if (members.length !== ids.length) return 'Участник недоступен.';
      await tx.payrollHandling.create({ data: { id: m.eventId, warehouseId: d.warehouseId, startsAt: start, operation: p.type === 'LOADING' ? 'LOAD' : 'UNLOAD', palletCount: new Prisma.Decimal(p.pallets), status: 'REVIEW', createdById: `device:${d.id}`, reason: p.comment,
        shares: { create: members.map(member => ({ employeeId: member.id })) } } });
      return '';
    }
    const open = await tx.payrollShift.findFirst({ where: { employeeId: e.id, cancelledAt: null, endsAt: null } });
    if (m.kind === 'CLOCK_IN' && open) return 'Смена уже открыта.';
    if (m.kind === 'CLOCK_OUT' && (!open || at <= open.startsAt)) return 'Нет подходящего открытого прихода.';
    const day = open?.workDate ?? workDate(at.toISOString());
    if (await tx.payrollHistorical.findFirst({ where: { employeeId: e.id, workDate: day } })) return 'День уже импортирован из табеля.';
    if (await tx.payrollSettlement.findFirst({ where: { employeeId: e.id, workDate: day, status: 'PAID', key: { startsWith: 'WORK:' } } })) return 'День уже оплачен.';
    const start = open?.startsAt ?? at;
    if (await tx.payrollShift.findFirst({ where: { employeeId: e.id, cancelledAt: null, ...(open ? { id: { not: open.id } } : {}), startsAt: { lt: m.kind === 'CLOCK_OUT' ? at : new Date('9999-01-01') }, OR: [{ endsAt: null }, { endsAt: { gt: start } }] } })) return 'Пересечение с существующей сменой.';
    if (open) await tx.payrollShift.update({ where: { id: open.id }, data: { endsAt: at, endPhoto: m.eventId, version: { increment: 1 } } });
    else await tx.payrollShift.create({ data: { id: m.eventId, employeeId: e.id, startsAt: at, workDate: day, source: 'TABLET', startPhoto: m.eventId, createdById: `device:${d.id}` } });
    return '';
  }
  private audit(tx: Tx, warehouseId: string, actorId: string, entityId: string, action: string, details: Prisma.InputJsonValue) {
    return tx.payrollAudit.create({ data: { warehouseId, actorId, entityId, action, details } });
  }
  async devices(user: AuthUser) {
    this.scope(user); const rows = await this.prisma.$queryRaw<Array<Device & { lastSeenAt: Date; createdAt: Date }>>`SELECT id, "warehouseId", "isDemo", name, "revokedAt", "lastSeenAt", "createdAt" FROM "AttendanceDevice" ORDER BY "createdAt" DESC`;
    const ids = payrollWarehouses(user); return rows.filter(d => d.isDemo === Boolean(user.isDemo) && (!ids || ids.includes(d.warehouseId)));
  }
  async revoke(user: AuthUser, id: string) {
    this.scope(user, true);
    return this.prisma.$transaction(async tx => {
      const d = (await tx.$queryRaw<Device[]>`SELECT * FROM "AttendanceDevice" WHERE id = ${uuid(id)} FOR UPDATE`)[0];
      if (!d) throw new NotFoundException(); this.access(user, d, true);
      await tx.$executeRaw`UPDATE "AttendanceDevice" SET "revokedAt" = NOW() WHERE id = ${id}`;
      await this.audit(tx, d.warehouseId, user.id, id, 'TABLET_REVOKED', {}); return { ok: true };
    });
  }
  async events(user: AuthUser, employeeId: string | undefined, from: string, to: string) {
    this.scope(user); if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) fail('Выберите период.');
    const start = new Date(`${from}T00:00:00+03:00`), end = new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86400000);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 366 * 86400000) fail('Период до одного года.');
    const ids = payrollWarehouses(user);
    const rows = await this.prisma.$queryRaw<unknown[]>(Prisma.sql`SELECT e.id, e."employeeId", p.name, e."warehouseId", e.kind, e."effectiveAt", e.status, e.reason, COALESCE(r.status, 'NOT_REQUESTED') AS "photoStatus" FROM "AttendanceEvent" e JOIN "PayrollEmployee" p ON p.id = e."employeeId" LEFT JOIN "AttendancePhotoRequest" r ON r."eventId" = e.id WHERE e."isDemo" = ${Boolean(user.isDemo)} AND e."effectiveAt" >= ${start} AND e."effectiveAt" < ${end} ${ids ? Prisma.sql`AND e."warehouseId" IN (${Prisma.join(ids.length ? ids : ['__none'])})` : Prisma.empty} ${employeeId ? Prisma.sql`AND e."employeeId" = ${employeeId}` : Prisma.empty} ORDER BY e."effectiveAt" DESC LIMIT 500`);
    return rows;
  }
  private async entry(tx: Tx, user: AuthUser, id: string, write = false) {
    this.scope(user, write); const e = (await tx.$queryRaw<Entry[]>`SELECT * FROM "AttendanceEvent" WHERE id = ${uuid(id)} FOR UPDATE`)[0];
    if (!e) throw new NotFoundException(); this.access(user, e, write); return e;
  }
  async resolve(user: AuthUser, id: string, body: Record<string, unknown>) {
    const reason = text(body.reason, 1000); if (!['ACCEPT', 'DISMISS'].includes(String(body.action))) fail();
    return this.prisma.$transaction(async tx => {
      const entry = await this.entry(tx, user, id, true);
      if (entry.status !== 'REVIEW') throw new ConflictException('Отметка уже обработана.');
      const e = await this.lockEmployee(tx, entry.employeeId, entry);
      const at = body.effectiveAt ? new Date(text(body.effectiveAt)) : entry.effectiveAt;
      if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 300000) fail('Проверьте время.');
      if (body.action === 'ACCEPT') {
        if (!e.isActive) fail('Сотрудник неактивен.');
        const conflict = await this.apply(tx, { ...entry, id: entry.deviceId }, e, entry.data, at); if (conflict) fail(conflict);
      }
      const result = { eventId: id, status: 'ACCEPTED', reason: body.action === 'DISMISS' ? `Отклонено администратором: ${reason}` : reason, photoStored: false, employee: await this.employeeState(tx, e) };
      await tx.$executeRaw`UPDATE "AttendanceEvent" SET status = 'ACCEPTED', reason = ${result.reason}, result = ${JSON.stringify(result)}::jsonb, "effectiveAt" = ${at}, acknowledged = false WHERE id = ${id}`;
      await this.audit(tx, entry.warehouseId, user.id, id, 'TABLET_REVIEW_RESOLVED', { reason, action: body.action as string, effectiveAt: at.toISOString() });
      return result;
    });
  }
  async requestPhoto(user: AuthUser, id: string) {
    return this.prisma.$transaction(async tx => {
      const e = await this.entry(tx, user, id, true);
      if (e.kind === 'HANDLING') fail('У погрузки нет фотографии.');
      const offset = e.data.serverOffsetMs ?? 0;
      const expiresAt = new Date(Math.min(e.effectiveAt.getTime(), e.data.capturedAtMs + (Math.abs(offset) <= 86400000 ? offset : 0)) + ATTENDANCE_RETENTION);
      const status = expiresAt.getTime() <= Date.now() ? 'EXPIRED' : 'PENDING';
      await tx.$executeRaw`INSERT INTO "AttendancePhotoRequest" (id, "eventId", "deviceId", "requestedById", "expiresAt", status) VALUES (${randomUUID()}, ${id}, ${e.deviceId}, ${user.id}, ${expiresAt}, ${status}) ON CONFLICT ("eventId") DO NOTHING`;
      await this.audit(tx, e.warehouseId, user.id, id, 'TABLET_PHOTO_REQUESTED', {});
      return (await tx.$queryRaw<Array<Omit<Photo, 'photo'>>>`SELECT id, "eventId", "deviceId", "expiresAt", status FROM "AttendancePhotoRequest" WHERE "eventId" = ${id}`)[0];
    });
  }
  async uploadPhoto(auth: string | undefined, id: string, key: string | undefined, body: Record<string, unknown>, file?: Express.Multer.File) {
    if (uuid(id) !== key || body.requestId !== id || !['AVAILABLE', 'EXPIRED', 'UNAVAILABLE'].includes(String(body.status))) fail();
    return this.prisma.$transaction(async tx => {
      const d = await this.device(tx, auth);
      const p = (await tx.$queryRaw<Photo[]>`SELECT * FROM "AttendancePhotoRequest" WHERE id = ${id} AND "deviceId" = ${d.id} FOR UPDATE`)[0];
      if (!p || p.eventId !== body.eventId) throw new NotFoundException('Запрос фото не найден.');
      const e = (await tx.$queryRaw<Entry[]>`SELECT * FROM "AttendanceEvent" WHERE id = ${p.eventId} AND "deviceId" = ${d.id}`)[0];
      if (!e) throw new NotFoundException();
      if (p.expiresAt.getTime() <= Date.now()) {
        await tx.$executeRaw`UPDATE "AttendancePhotoRequest" SET status = 'EXPIRED', photo = NULL WHERE id = ${id}`;
        return { requestId: id, eventId: p.eventId, status: 'EXPIRED' };
      }
      if (p.status !== 'PENDING') return { requestId: id, eventId: p.eventId, status: p.status };
      let bytes: Buffer | null = null;
      if (body.status === 'AVAILABLE') {
        bytes = file?.buffer ?? null;
        if (!bytes || bytes.length > 4 * 1024 * 1024 || hash(bytes) !== e.data.photoSha256 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[bytes.length - 2] !== 255 || bytes[bytes.length - 1] !== 217) fail('Неверное изображение.');
        try { const pdf = await PDFDocument.create(); const img = await pdf.embedJpg(Uint8Array.from(bytes)); if (img.width > 4096 || img.height > 4096 || img.width < 1 || img.height < 1) fail(); }
        catch { fail('Некорректный JPEG.'); }
      } else if (file) fail('Фото не ожидалось.');
      const status = bytes ? 'STORED' : String(body.status);
      await tx.$executeRaw`UPDATE "AttendancePhotoRequest" SET status = ${status}, photo = ${bytes} WHERE id = ${id}`;
      return { requestId: id, eventId: p.eventId, status };
    }, { timeout: 20000 });
  }
  async photo(user: AuthUser, id: string) {
    return this.prisma.$transaction(async tx => {
      const e = await this.entry(tx, user, id);
      const p = (await tx.$queryRaw<Photo[]>`SELECT * FROM "AttendancePhotoRequest" WHERE "eventId" = ${id} AND "expiresAt" > NOW() AND status = 'STORED'`)[0];
      if (!p?.photo) throw new NotFoundException('Фото ожидается, недоступно или срок хранения истёк.');
      await this.audit(tx, e.warehouseId, user.id, id, 'TABLET_PHOTO_VIEWED', {}); return p.photo;
    });
  }
}
