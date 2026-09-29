import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceConnectionsService } from '../src/modules/marketplace-connections/marketplace-connections.service';
import { createRequire } from 'node:module';

// TEST: the same behavior can be checked against the isolated deployed runtime overlay.
const Service = process.env.WMS_FBS_NEXT_RUNTIME
  ? createRequire(import.meta.url)(process.env.WMS_FBS_NEXT_RUNTIME).MarketplaceConnectionsService
  : MarketplaceConnectionsService;

const user = { id: 'picker', name: 'Сборщик', roleCodes: ['WORKER'], deviceCode: 'TSD-1' } as any;

function fixture() {
  const db = {
    fbsTsdAssembly: { findFirst: vi.fn(async () => null), updateMany: vi.fn(), create: vi.fn() },
    clientRequest: { findUnique: vi.fn(async () => ({ id: 'request-1508', clientId: 'allowed-client', status: 'IN_WORK' })) },
    clientMarketplaceConnection: { findMany: vi.fn(async () => [{ clientId: 'allowed-client' }]) },
  };
  const scopes = { requireClientAccess: vi.fn(), resolveClientFilter: vi.fn(() => 'allowed-client') };
  const service = new Service(db as never, scopes as never) as any;
  const response = { orders: [] };
  vi.spyOn(service, 'loadFbsTsdRequestOrders').mockResolvedValue(response);
  vi.spyOn(service, 'mergeSyncedFbsTsdRequestOrders').mockResolvedValue(response);
  vi.spyOn(service, 'emptyFbsTsdAssembly').mockReturnValue({ state: 'EMPTY' });
  return { db, scopes, service, response };
}

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('TSD next task without a selected request', () => {
  // TEST: reproduce the 20:42 unselected request blocking every subsequent selected request.
  it('does not enter a pending marketplace/billing load or block the selected queue in local mode', async () => {
    vi.stubEnv('WMS_FBS_TSD_FAST_LOCAL_ENABLED', 'true');
    vi.stubEnv('WMS_FBS_ASSIGNMENT_BUSY_GUARD_ENABLED', 'false');
    vi.useFakeTimers();
    const f = fixture();
    let release!: (value: any) => void;
    const remote = new Promise(resolve => { release = resolve; });
    const load = vi.spyOn(f.service, 'loadFbsOrders').mockReturnValue(remote);
    let firstDone = false, selectedDone = false;
    const first = f.service.getNextFbsTsdAssembly('TSD-1', user, '').then(() => { firstDone = true; });
    const selected = f.service.getNextFbsTsdAssembly('TSD-1', user, 'request-1508').then(() => { selectedDone = true; });
    try {
      await vi.advanceTimersByTimeAsync(25_000);
      expect({ firstDone, selectedDone }).toEqual({ firstDone: true, selectedDone: true });
      expect(load).not.toHaveBeenCalled();
      expect(f.service.loadFbsTsdRequestOrders).toHaveBeenCalledWith('allowed-client');
      expect(f.service.loadFbsTsdRequestOrders).toHaveBeenCalledWith('allowed-client', 'request-1508');
      expect(f.service.mergeSyncedFbsTsdRequestOrders).not.toHaveBeenCalled();
      expect(f.db.clientMarketplaceConnection.findMany.mock.calls[0][0].where.clientId).toBe('allowed-client');
      expect(f.db.fbsTsdAssembly.updateMany).not.toHaveBeenCalled();
      expect(f.db.fbsTsdAssembly.create).not.toHaveBeenCalled();
    } finally {
      release(f.response);
      await Promise.all([first, selected]);
    }
  });

  // TEST: the local loading path also works with the separately introduced busy guard.
  it('finishes local loading before opening the selected request with the busy guard enabled', async () => {
    vi.stubEnv('WMS_FBS_TSD_FAST_LOCAL_ENABLED', 'true');
    vi.stubEnv('WMS_FBS_ASSIGNMENT_BUSY_GUARD_ENABLED', 'true');
    const f = fixture();
    const load = vi.spyOn(f.service, 'loadFbsOrders').mockReturnValue(new Promise(() => {}));
    await expect(f.service.getNextFbsTsdAssembly('TSD-1', user, '')).resolves.toEqual({ state: 'EMPTY' });
    await expect(f.service.getNextFbsTsdAssembly('TSD-1', user, 'request-1508')).resolves.toEqual({ state: 'EMPTY' });
    expect(load).not.toHaveBeenCalled();
    expect(f.service.fbsTsdAssignmentLocks.size).toBe(0);
  });

  // TEST: the isolated feature flag preserves the legacy environment's loading path.
  it('preserves marketplace loading and local merging when the flag is disabled', async () => {
    vi.stubEnv('WMS_FBS_TSD_FAST_LOCAL_ENABLED', 'false');
    const f = fixture();
    const load = vi.spyOn(f.service, 'loadFbsOrders').mockResolvedValue(f.response);
    await expect(f.service.getNextFbsTsdAssembly('TSD-1', user, '')).resolves.toEqual({ state: 'EMPTY' });
    expect(load).toHaveBeenCalledWith('allowed-client');
    expect(f.service.mergeSyncedFbsTsdRequestOrders).toHaveBeenCalledWith('allowed-client', f.response);
    expect(f.service.loadFbsTsdRequestOrders).not.toHaveBeenCalled();
  });
});
