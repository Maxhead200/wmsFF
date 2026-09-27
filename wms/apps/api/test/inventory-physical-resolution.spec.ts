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
