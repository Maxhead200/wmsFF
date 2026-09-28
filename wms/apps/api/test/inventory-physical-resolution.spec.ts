import { afterEach, expect, it, vi } from 'vitest';
import { resolveConfirmedPhysicalKiz } from '../src/modules/inventory/confirmed-kiz-physical-resolution';
afterEach(() => vi.unstubAllEnvs());
// TEST: the opt-in path must retain authority, ownership and concurrent-write guards.
it.each(['disabled', 'worker', 'demo', 'client', 'warehouse', 'newer', 'fbs', 'fbo', 'race'])('physical confirmation guard: %s', async kind => {
  vi.stubEnv('WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED', kind === 'disabled' ? 'false' : 'true');
  const value = '0104640684268301215%lJ\'qqfFEIRI';
  const mark: any = { id: 'm', value, skuId: 'sku', clientId: kind === 'client' ? 'foreign' : 'client', boxId: 'source', status: 'BLOCKED',
    updatedAt: new Date(kind === 'newer' ? '2026-10-01' : '2026-09-01'), box: { warehouseId: kind === 'warehouse' ? 'foreign' : 'wh' } };
  const tx: any = { fbsTsdAssembly: { findFirst: vi.fn(async () => kind === 'fbs' ? { id: 'task' } : null) },
    fboAssemblyUnit: { findFirst: vi.fn(async () => kind === 'fbo' ? { id: 'unit' } : null) },
    box: { findUnique: vi.fn(async () => ({ id: 'source', clientId: 'client', warehouseId: 'wh' })) },
    stockBalance: { findMany: vi.fn(async () => []), updateMany: vi.fn() },
    stockMovement: { create: vi.fn() }, productMark: { updateMany: vi.fn(async () => ({ count: 0 })) }, auditLog: { create: vi.fn() } };
  const user: any = { id: 'admin', roleCodes: [kind === 'worker' ? 'WORKER' : 'ADMIN'], isDemo: kind === 'demo' };
  const run = resolveConfirmedPhysicalKiz(tx, { marks: [mark], scans: [{ identity: value, value, skuId: 'sku' }],
    box: { id: 'target', clientId: 'client', warehouseId: 'wh' }, auditId: 'audit', startedAt: new Date('2026-09-27') }, user);
  if (['disabled', 'worker', 'demo'].includes(kind)) await expect(run).resolves.toBeUndefined();
  else await expect(run).rejects.toThrow();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
  expect(tx.stockMovement.create).not.toHaveBeenCalled();
  if (kind !== 'race') expect(tx.productMark.updateMany).not.toHaveBeenCalled();
});

// TEST: a completed FBO keeps PACKED history after releasing activeMarkId.
it('does not treat request 1221 historical PACKED units as an active pick', async () => {
  vi.stubEnv('WMS_INVENTORY_PHYSICAL_RESOLUTION_ENABLED', 'true');
  const value = '0104680992599810215cjsIgrU9t%p=';
  const mark: any = { id: 'mark', value, clientId: 'client', skuId: 'sku', boxId: null, status: 'SHIPPING', updatedAt: new Date('2026-09-26') };
  const tx: any = {
    fbsTsdAssembly: { findFirst: vi.fn(async () => null) },
    fboAssemblyUnit: { findFirst: vi.fn(async ({ where }: any) => {
      const historicalMatch = where.OR.find((clause: any) => clause.state);
      // Simulate the persisted historical PACKED row with a COMPLETED parent.
      return historicalMatch.assembly?.phase?.not === 'COMPLETED' ? null : { id: 'old-packed' };
    }) },
    productMark: { updateMany: vi.fn(async ({ data }: any) => { Object.assign(mark, data); return { count: 1 }; }), findUniqueOrThrow: vi.fn(async () => mark) },
    auditLog: { create: vi.fn() }, stockMovement: { create: vi.fn() },
  };
  await resolveConfirmedPhysicalKiz(tx, { marks: [mark], scans: [{ identity: value, value, skuId: 'sku' }],
    box: { id: 'box222', clientId: 'client', warehouseId: 'wh' }, auditId: 'audit', startedAt: new Date('2026-09-27') }, { id: 'owner', roleCodes: ['OWNER'] } as any);
  expect(mark).toMatchObject({ status: 'AVAILABLE', boxId: 'box222' });
  expect(tx.stockMovement.create).not.toHaveBeenCalled();
  expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
});
