// TEST: a browser-independent, shared OpenClaw history is read only by current WMS administrators.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WmsOpenClawService } from '../src/modules/wms-ai/wms-openclaw.service';

const owner = { id: 'owner', administrationEnabled: true, clientScopeMode: 'ALL', roleCodes: ['OWNER'], permissionCodes: ['system:admin'] } as any;
const admin = { ...owner, id: 'admin', roleCodes: ['ADMIN'] };
const rows = Array.from({ length: 21 }, (_, index) => ({
  id: `openclaw:00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, userId: index % 2 ? 'admin' : 'owner',
  action: 'WMS_OPENCLAW_JOB', entity: 'OpenClawJob', createdAt: new Date(Date.now() - index * 1_000),
  user: { name: index % 2 ? 'Администратор' : 'Владелец' },
  payload: { requestId: `job-${index}`, conversationId: index % 2 ? 'thread-admin' : 'thread-owner',
    message: `Задание ${index}`, answer: `Ответ ${index}`, status: 'DONE', warehouseId: 'warehouse' },
}));
function setup() {
  const prisma = { auditLog: {
    findUnique: vi.fn(async ({ where }: any) => rows.find(row => row.id === where.id) ?? null),
    findMany: vi.fn(async ({ cursor, skip = 0 }: any) => rows.slice(cursor ? rows.findIndex(row => row.id === cursor.id) + skip : 0)),
  } };
  return { service: new WmsOpenClawService(prisma as never), prisma };
}
beforeEach(() => { vi.stubEnv('WMS_OPENCLAW_ENABLED', 'true'); vi.stubEnv('WMS_OPENCLAW_ACCESS', 'administrators'); });
afterEach(() => vi.unstubAllEnvs());

describe('shared OpenClaw job history', () => {
  it('returns both operators with dates, request text and results, page by page', async () => {
    const { service, prisma } = setup();
    const first = await service.listJobs(owner);
    expect(first.items).toHaveLength(20);
    expect(first.items[1]).toMatchObject({ userId: 'admin', userName: 'Администратор', message: 'Задание 1', answer: 'Ответ 1' });
    expect(first.items[0].createdAt).toBeTruthy();
    expect(first.nextCursor).toBe(rows[19].id);
    expect(prisma.auditLog.findMany.mock.calls[0][0]).toMatchObject({
      where: { id: { gte: 'openclaw:', lt: 'openclaw;' }, action: 'WMS_OPENCLAW_JOB', entity: 'OpenClawJob' }, take: 21,
    });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where.userId).toBeUndefined();
    const second = await service.listJobs(admin, first.nextCursor);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].requestId).toBe('job-20');
    expect(prisma.auditLog.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: rows[19].id }, skip: 1 });
  });

  it('denies workers, demos, clients and a disabled installation before querying the journal', async () => {
    const { service, prisma } = setup();
    for (const user of [
      { ...owner, administrationEnabled: false, permissionCodes: [] },
      { ...owner, isDemo: true },
      { ...owner, roleCodes: ['CLIENT'] },
    ]) await expect(service.listJobs(user)).rejects.toThrow();
    vi.stubEnv('WMS_OPENCLAW_ENABLED', 'false');
    await expect(service.listJobs(owner)).rejects.toThrow();
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('rejects malformed cursors before querying the journal', async () => {
    const { service, prisma } = setup();
    await expect(service.listJobs(owner, 'audit:another-action')).rejects.toThrow();
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });
});
