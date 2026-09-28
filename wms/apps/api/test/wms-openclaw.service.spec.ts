// TEST: privileged requests must never inherit ordinary warehouse access or replay mutations.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WmsOpenClawService } from '../src/modules/wms-ai/wms-openclaw.service';

const owner = { id: 'owner', administrationEnabled: true, clientScopeMode: 'ALL', roleCodes: ['OWNER'], permissionCodes: ['system:admin'] } as never;
const input = { requestId: 'fc744b90-86e4-4fe0-8207-1ae4ead03540', conversationId: '03b06bbf-fcaf-4163-8349-91b2404d5196', message: 'Проверь остатки' };
function setup() {
  const records = new Map<string, any>();
  const prisma = { auditLog: {
    create: vi.fn(async ({ data }) => {
      if (records.has(data.id)) throw { code: 'P2002' };
      records.set(data.id, { ...data, createdAt: new Date() });
      return records.get(data.id);
    }),
    findUnique: vi.fn(async ({ where }) => records.get(where.id) ?? null),
    update: vi.fn(async ({ where, data }) => { Object.assign(records.get(where.id), data); }),
  } };
  return { service: new WmsOpenClawService(prisma as never), prisma, records };
}
beforeEach(() => {
  vi.stubEnv('WMS_OPENCLAW_ENABLED', 'true');
  vi.stubEnv('WMS_OPENCLAW_ACCESS', 'allowlist');
  vi.stubEnv('WMS_OPENCLAW_USER_IDS', 'owner,admin');
  vi.stubEnv('WMS_OPENCLAW_URL', 'http://127.0.0.1:18789');
  vi.stubEnv('WMS_OPENCLAW_TOKEN', 'test-private-token');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('OpenClaw boundary and durable submission', () => {
  it('denies staff, clients, demo accounts and unlisted administrators', async () => {
    const { service, prisma } = setup();
    for (const user of [
      { ...owner, id: 'staff', permissionCodes: ['stock:read'] },
      { ...owner, id: 'other-admin' },
      { ...owner, isDemo: true },
      { ...owner, clientScopeMode: 'LIMITED' },
      { ...owner, roleCodes: ['CLIENT'] },
    ]) await expect(service.submit(input, user as never)).rejects.toThrow();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
  it('allows only explicitly listed administrators and fails closed with empty list', () => {
    const { service } = setup();
    expect(service.status({ ...owner, id: 'admin', administrationEnabled: false, roleCodes: ['ADMIN'] } as never).allowed).toBe(true);
    vi.stubEnv('WMS_OPENCLAW_USER_IDS', '');
    expect(service.status(owner).allowed).toBe(false);
  });
  it('honours Konstantin’s explicit choice of all administrators and owners', () => {
    vi.stubEnv('WMS_OPENCLAW_ACCESS', 'administrators');
    const { service } = setup();
    expect(service.status({ ...owner, id: 'another-admin', administrationEnabled: false, roleCodes: ['ADMIN'] } as never).allowed).toBe(true);
    expect(service.status({ ...owner, id: 'another-owner', permissionCodes: [], roleCodes: ['OWNER'] } as never).allowed).toBe(true);
    expect(service.status({ ...owner, administrationEnabled: false, permissionCodes: ['stock:read'] } as never).allowed).toBe(false);
  });
  it('does not dispatch twice for concurrent retries, even from another API instance', async () => {
    const fetchMock = vi.fn(() => new Promise(() => {})); vi.stubGlobal('fetch', fetchMock);
    const { service, prisma } = setup();
    const another = new WmsOpenClawService(prisma as never);
    const jobs = await Promise.all([service.submit(input, owner), another.submit(input, owner)]);
    expect(jobs.map(x => x.status)).toEqual(['RUNNING', 'RUNNING']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(service.submit({ ...input, message: 'Другой запрос' }, owner)).rejects.toThrow();
    await expect(service.get(input.requestId, { ...owner, id: 'admin' } as never)).rejects.toThrow();
  });
  it('binds sessions to authenticated user and warehouse and never returns bearer token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Готово' } }] }), { status: 200 })));
    const { service } = setup();
    await service.submit(input, { ...owner, activeWarehouseId: 'moscow' } as never);
    await vi.waitFor(async () => expect((await service.get(input.requestId, owner)).status).toBe('DONE'));
    const call = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);
    expect(body.user).toContain('owner:moscow:');
    expect(body.model).toBe('openclaw/wms');
    expect(JSON.stringify(await service.get(input.requestId, owner))).not.toContain('test-private-token');
  });
  it('marks uncertain transport failures UNKNOWN without replay or leaking errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('test-private-token'); }));
    const { service } = setup();
    await service.submit(input, owner);
    await vi.waitFor(async () => expect((await service.get(input.requestId, owner)).status).toBe('UNKNOWN'));
    await service.submit(input, owner);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await service.get(input.requestId, owner))).not.toContain('test-private-token');
  });
  it('keeps the sold/legacy configuration disabled and rejects public gateway URLs', async () => {
    const { service } = setup();
    vi.stubEnv('WMS_OPENCLAW_ENABLED', 'false');
    expect(service.status(owner).enabled).toBe(false);
    await expect(service.submit(input, owner)).rejects.toThrow();
    vi.stubEnv('WMS_OPENCLAW_ENABLED', 'true'); vi.stubEnv('WMS_OPENCLAW_URL', 'https://example.com');
    await expect(service.submit(input, owner)).rejects.toThrow();
  });
  it('never executes when the durable database claim fails', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { service, prisma } = setup(); prisma.auditLog.create.mockRejectedValueOnce(new Error('DB unavailable'));
    await expect(service.submit(input, owner)).rejects.toThrow('DB unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('exposes an interrupted old job as UNKNOWN and refuses to restart it', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { service, records } = setup(); await service.submit(input, owner);
    const record = [...records.values()][0]; record.createdAt = new Date(Date.now() - 12 * 60_000);
    expect((await service.get(input.requestId, owner)).status).toBe('UNKNOWN');
    expect((await service.submit(input, owner)).status).toBe('UNKNOWN'); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
