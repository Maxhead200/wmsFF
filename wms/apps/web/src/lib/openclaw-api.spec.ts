// TEST: browser submits durable IDs without gateway secrets and never replays on network failure.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOpenClawJob, fetchOpenClawStatus, submitOpenClawJob, OpenClawHttpError, openClawPollUncertain } from './openclaw-api';
afterEach(() => vi.unstubAllGlobals());
describe('OpenClaw browser protocol', () => {
  it('waits for delayed acceptance but stops missing-job polling after eleven minutes', () => {
    const missing = new OpenClawHttpError('Not found', 404);
    expect(openClawPollUncertain(missing, 100, 100 + 30_000)).toBe(false);
    expect(openClawPollUncertain(missing, 100, 100 + 12 * 60_000)).toBe(true);
    expect(openClawPollUncertain(new OpenClawHttpError('Forbidden', 403), 100, 101)).toBe(true);
    expect(openClawPollUncertain(new Error('temporary network error'), 100, 101)).toBe(false);
  });
  it('sends the WMS token and job IDs only to the WMS API', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'RUNNING', requestId: 'job-id' })));
    vi.stubGlobal('fetch', fetchMock);
    const input = { requestId: 'job-id', conversationId: 'conversation', message: 'Проверь склад' };
    await submitOpenClawJob('wms-session', { ...input, submittedAt: 123 } as never);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/wms-ai/openclaw/jobs');
    expect(options.body).toBe(JSON.stringify(input));
    expect(options.headers).toMatchObject({ Authorization: 'Bearer wms-session' });
    expect(JSON.stringify(options)).not.toContain('OPENCLAW_GATEWAY_TOKEN');
  });
  it('recovers an existing job by GET instead of submitting it again', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'DONE', answer: 'Готово' })));
    vi.stubGlobal('fetch', fetchMock);
    await fetchOpenClawJob('session', 'job/id');
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/v1/wms-ai/openclaw/jobs/job%2Fid');
    expect(options.method).toBe('GET'); expect(options.body).toBeUndefined();
  });
  it('does not retry a submission after an uncertain connection failure', async () => {
    const fetchMock = vi.fn(async () => { throw new Error('connection lost'); });
    vi.stubGlobal('fetch', fetchMock);
    await expect(submitOpenClawJob('session', { requestId: 'id', conversationId: 'conv', message: 'Измени' })).rejects.toThrow('connection lost');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('preserves HTTP denial status to distinguish rejection from transport uncertainty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Нет доступа' }), { status: 403 })));
    await expect(fetchOpenClawStatus('session')).rejects.toMatchObject({ status: 403, message: 'Нет доступа' });
    await expect(fetchOpenClawStatus('session')).rejects.toBeInstanceOf(OpenClawHttpError);
  });
});
