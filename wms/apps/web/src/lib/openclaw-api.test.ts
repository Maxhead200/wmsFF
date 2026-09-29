import { afterEach, expect, it, vi } from 'vitest';
import { fetchOpenClawHistory } from './openclaw-api';

afterEach(() => vi.unstubAllGlobals());

// TEST: reload/history pagination only read WMS; they never replay a command.
it('reads shared OpenClaw history with authenticated GET requests', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await fetchOpenClawHistory('session-token');
  await fetchOpenClawHistory('session-token', 'openclaw:job/1');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toContain('/wms-ai/openclaw/jobs');
  expect(fetchMock.mock.calls[1][0]).toContain('cursor=openclaw%3Ajob%2F1');
  for (const [, options] of fetchMock.mock.calls) {
    expect(options?.method).toBe('GET');
    expect(options?.body).toBeUndefined();
    expect((options?.headers as Record<string, string>).Authorization).toBe('Bearer session-token');
  }
});
