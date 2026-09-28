const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';
export type OpenClawStatus = { enabled: boolean; allowed: boolean; provider: string; engine: string };
export type OpenClawJob = { requestId: string; status: 'RUNNING' | 'DONE' | 'UNKNOWN'; answer?: string; error?: string };
export class OpenClawHttpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
// FIX: all gateway credentials and operator identity stay on the API server.
async function request<T>(token: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE}/wms-ai/openclaw/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string | string[] };
    throw new OpenClawHttpError(Array.isArray(payload.message) ? payload.message.join('\n') : payload.message ?? `HTTP ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}
export const fetchOpenClawStatus = (token: string) => request<OpenClawStatus>(token, 'status');
export const fetchOpenClawJob = (token: string, id: string) => request<OpenClawJob>(token, `jobs/${encodeURIComponent(id)}`);
export const submitOpenClawJob = (token: string, body: { requestId: string; conversationId: string; message: string }) => request<OpenClawJob>(token, 'jobs', body);
