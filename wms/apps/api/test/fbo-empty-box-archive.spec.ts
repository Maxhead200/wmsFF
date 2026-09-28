import { afterEach, expect, it, vi } from 'vitest';
import { StockOperationsService } from '../src/modules/stock/stock-operations.service';
afterEach(() => vi.unstubAllEnvs());
function fixture() {
  const tx: any = {
    fboAssembly: { findUnique: vi.fn().mockResolvedValue({ requestId: 'r' }) },
    clientRequest: { findUniqueOrThrow: vi.fn().mockResolvedValue({ clientId: 'c', warehouseId: 'w' }) },
    box: { findMany: vi.fn().mockResolvedValue([{ id: 'b', code: 'FFL_LKB0909_249', status: 'active' }]), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    stockBalance: { count: vi.fn().mockResolvedValue(0) }, productMark: { count: vi.fn().mockResolvedValue(0) },
    fbsTsdAssembly: { count: vi.fn().mockResolvedValue(0) }, fboAssemblyUnit: { count: vi.fn().mockResolvedValue(0) },
    auditLog: { create: vi.fn() },
  };
  const detach = vi.fn();
  const s: any = Object.assign(Object.create(StockOperationsService.prototype), {
    archivedEmptyBoxDetach: { detachIfArchivedAndEmpty: detach },
    boxCodes: { getPolicy: async () => ({ storageBoxPrefix: 'FFL_LKBOX_', storageBoxAliases: [] }), normalize: async (s: string) => s },
  });
  vi.stubEnv('WMS_FBO_EMPTY_BOX_ARCHIVE_ENABLED', 'true');
  vi.stubEnv('WMS_PERMANENT_STORAGE_BOXES_ENABLED', 'true');
  return { tx, s, detach };
}
// TEST: the last FBO unit must archive its emptied source and remove its placement atomically.
it('archives an empty receipt box and records its detachment', async () => {
  const { tx, s, detach } = fixture();
  expect(await s.archiveEmptyFboBoxes(tx, 'r', { id: 'u' }, ['b'])).toEqual(['b']);
  expect(tx.box.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'archived' } }));
  expect(detach).toHaveBeenCalledWith(expect.objectContaining({ boxId: 'b' }), tx);
  expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
});
// TEST: do not treat a reserved/packing quantity, KIZ, active task or permanent location as empty.
it.each(['stockBalance', 'productMark', 'fbsTsdAssembly', 'fboAssemblyUnit', 'permanent', 'disabled', 'race'])('preserves %s', async kind => {
  const { tx, s, detach } = fixture();
  if (kind === 'permanent') tx.box.findMany.mockResolvedValue([{ id: 'b', code: 'FFL_LKBOX_222' }]);
  else if (kind === 'disabled') vi.stubEnv('WMS_FBO_EMPTY_BOX_ARCHIVE_ENABLED', 'false');
  else if (kind === 'race') tx.box.updateMany.mockResolvedValue({ count: 0 });
  else tx[kind].count.mockResolvedValue(1);
  expect(await s.archiveEmptyFboBoxes(tx, 'r', { id: 'u' }, ['b'])).toEqual([]);
  expect(detach).not.toHaveBeenCalled();
  expect(tx.auditLog.create).not.toHaveBeenCalled();
});
