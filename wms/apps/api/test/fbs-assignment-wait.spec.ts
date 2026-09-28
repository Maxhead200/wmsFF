import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceConnectionsService } from '../src/modules/marketplace-connections/marketplace-connections.service';

afterEach(() => vi.unstubAllEnvs());
const service = () => Object.assign(Object.create(MarketplaceConnectionsService.prototype), {
  fbsTsdAssignmentLocks: new Map(),
});

describe('FBS assignment wait', () => {
  // TEST: a stuck operation must not accumulate retries or permit duplicate picking.
  it('rejects retries promptly, retains the active lock, and allows another device', async () => {
    vi.stubEnv('WMS_FBS_ASSIGNMENT_BUSY_GUARD_ENABLED', 'true');
    const s = service(); let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const first = s.withFbsTsdAssignmentLock('marifat', () => pending);
    const retry = vi.fn();
    const result = await Promise.race([
      s.withFbsTsdAssignmentLock('marifat', retry).then(() => 'ran', (e: Error) => e.message),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 30)),
    ]);
    expect(result).toContain('Предыдущая операция');
    expect(retry).not.toHaveBeenCalled();
    expect(s.fbsTsdAssignmentLocks.size).toBe(1);
    expect(await s.withFbsTsdAssignmentLock('owner', async () => 'ok')).toBe('ok');
    finish(); await first;
    expect(await s.withFbsTsdAssignmentLock('marifat', async () => 'resumed')).toBe('resumed');
    expect(s.fbsTsdAssignmentLocks.size).toBe(0);
  });

  // TEST: the sold/default configuration preserves serial execution.
  it('preserves the legacy queue when disabled and releases after failure', async () => {
    vi.stubEnv('WMS_FBS_ASSIGNMENT_BUSY_GUARD_ENABLED', 'false');
    const s = service(); const calls: number[] = [];
    const first = s.withFbsTsdAssignmentLock('a', async () => { calls.push(1); throw new Error('failed'); }).catch(() => undefined);
    const next = s.withFbsTsdAssignmentLock('a', async () => { calls.push(2); });
    await Promise.all([first, next]);
    expect(calls).toEqual([1, 2]);
    expect(s.fbsTsdAssignmentLocks.size).toBe(0);
  });
});
