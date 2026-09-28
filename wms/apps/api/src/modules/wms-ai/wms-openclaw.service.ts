import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export type OpenClawJobInput = { requestId: string; conversationId: string; message: string };
type JobPayload = OpenClawJobInput & { status: 'RUNNING' | 'DONE' | 'UNKNOWN'; answer?: string; error?: string; warehouseId: string; finishedAt?: string };
const ACTION = 'WMS_OPENCLAW_JOB';
const UNKNOWN = 'Результат выполнения неизвестен. Проверьте журнал OpenClaw и фактические изменения перед новым заданием. Повторное выполнение отключено.';

// FIX: the privileged gateway is isolated from legacy warehouse chat permissions.
export function openClawEnabled() { return process.env.WMS_OPENCLAW_ENABLED === 'true'; }
export function openClawAllowed(user: AuthUser) {
  if (user.isDemo || user.clientScopeMode !== 'ALL' || user.roleCodes?.includes('CLIENT')) return false;
  const administrator = Boolean(user.administrationEnabled || user.permissionCodes?.includes('system:admin'));
  if (!administrator) return false;
  if (process.env.WMS_OPENCLAW_ACCESS === 'administrators') return true;
  return (process.env.WMS_OPENCLAW_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean).includes(user.id);
}

@Injectable()
export class WmsOpenClawService {
  constructor(private readonly prisma: PrismaService) {}

  status(user: AuthUser) {
    return { enabled: openClawEnabled(), allowed: openClawEnabled() && openClawAllowed(user), provider: 'OPENAI', engine: 'OPENCLAW' };
  }

  async submit(input: OpenClawJobInput, user: AuthUser) {
    this.assertAccess(user);
    this.validate(input);
    const config = this.config();
    const id = this.id(input.requestId);
    const payload: JobPayload = { ...input, message: input.message.trim(), status: 'RUNNING', warehouseId: user.activeWarehouseId ?? 'none' };
    // FIX: a database primary key arbitrates retries across API processes and restarts.
    try {
      await this.prisma.auditLog.create({ data: { id, userId: user.id, action: ACTION, entity: 'OpenClawJob', entityId: input.requestId, payload: payload as Prisma.InputJsonValue } });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const existing = await this.record(input.requestId, user);
      const old = existing.payload as unknown as JobPayload;
      if (old.message !== payload.message || old.conversationId !== payload.conversationId || old.warehouseId !== payload.warehouseId) {
        throw new ConflictException('Идентификатор задания уже использован для другого запроса.');
      }
      return this.publicJob(existing);
    }
    // No automatic retry: the agent may already have committed a real server change.
    void this.run(id, payload, user, config).catch(() => undefined);
    return { requestId: input.requestId, status: 'RUNNING' as const };
  }

  async get(requestId: string, user: AuthUser) {
    this.assertAccess(user);
    if (!this.uuid(requestId)) throw new BadRequestException('Некорректный идентификатор задания.');
    return this.publicJob(await this.record(requestId, user));
  }

  private assertAccess(user: AuthUser) {
    if (!openClawEnabled()) throw new ServiceUnavailableException('OpenClaw ещё не включён.');
    if (!openClawAllowed(user)) throw new ForbiddenException('OpenClaw доступен только разрешённым администраторам и владельцу.');
  }
  private uuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
  private validate(input: OpenClawJobInput) {
    if (!this.uuid(input.requestId) || !this.uuid(input.conversationId) || typeof input.message !== 'string' || input.message.trim().length < 2 || input.message.length > 4000) throw new BadRequestException('Некорректное задание OpenClaw.');
  }
  private id(requestId: string) { return `openclaw:${requestId.toLowerCase()}`; }
  private config() {
    const token = process.env.WMS_OPENCLAW_TOKEN;
    let url: URL;
    try { url = new URL(process.env.WMS_OPENCLAW_URL ?? ''); } catch { throw new ServiceUnavailableException('Не настроен адрес OpenClaw.'); }
    if (!token || url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '172.18.0.1', 'openclaw-gateway'].includes(url.hostname) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new ServiceUnavailableException('Требуется закрытый адрес и серверный токен OpenClaw.');
    return { url: new URL('/v1/chat/completions', url).toString(), token };
  }
  private async record(requestId: string, user: AuthUser) {
    const row = await this.prisma.auditLog.findUnique({ where: { id: this.id(requestId) } });
    if (!row || row.action !== ACTION || row.userId !== user.id) throw new NotFoundException('Задание не найдено.');
    return row;
  }
  private publicJob(row: { payload: unknown; createdAt: Date }) {
    const payload = row.payload as JobPayload;
    const stale = payload.status === 'RUNNING' && Date.now() - row.createdAt.getTime() > 11 * 60_000;
    return { requestId: payload.requestId, status: stale ? 'UNKNOWN' as const : payload.status, answer: payload.answer, error: stale ? UNKNOWN : payload.error };
  }
  private async run(id: string, payload: JobPayload, user: AuthUser, config: { url: string; token: string }) {
    try {
      const response = await fetch(config.url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10 * 60_000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openclaw/wms', stream: false,
          user: `wms:${user.id}:${payload.warehouseId}:${payload.conversationId.toLowerCase()}`,
          messages: [{ role: 'user', content: `Контекст WMS: userId=${user.id}, warehouseId=${payload.warehouseId}, jobId=${payload.requestId}.\n${payload.message}` }],
        }),
      });
      if (!response.ok) throw new Error('Gateway failed');
      const data = await response.json() as { choices?: { message?: { content?: unknown } }[] };
      const answer = data.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 100_000) throw new Error('Invalid response');
      const redacted = answer.replaceAll(config.token, '[скрыто]');
      await this.prisma.auditLog.update({ where: { id }, data: { payload: { ...payload, status: 'DONE', answer: redacted, finishedAt: new Date().toISOString() } as Prisma.InputJsonValue } });
    } catch {
      await this.prisma.auditLog.update({ where: { id }, data: { payload: { ...payload, status: 'UNKNOWN', error: UNKNOWN, finishedAt: new Date().toISOString() } as Prisma.InputJsonValue } });
    }
  }
}
