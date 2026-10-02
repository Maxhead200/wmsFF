import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSettlements } from './billing-settlements-api';
afterEach(() => vi.unstubAllGlobals());
// TEST: server filters, cancellation and errors retain their meaning; no silent zero balance.
describe('settlements transport', () => {
  it('sends dates, client, bearer and cancellation signal', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enabled: false }) }); vi.stubGlobal('fetch', mock);
    const abort = new AbortController();
    await fetchSettlements({ accessToken: 'test' } as any, { periodFrom: '2026-10-01', periodTo: '2026-10-02', clientId: 'c&2' }, abort.signal);
    expect(mock.mock.calls[0][0]).toContain('clientId=c%262');
    expect(mock.mock.calls[0][1]).toMatchObject({ signal: abort.signal, headers: { Authorization: 'Bearer test' } });
  });
  it('exposes access/limit errors instead of rendering an empty valid report', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: 'Нет доступа' }) }));
    await expect(fetchSettlements({ accessToken: 'test' } as any, { periodFrom: '2026-10-01', periodTo: '2026-10-02' })).rejects.toThrow('Нет доступа');
  });
});
