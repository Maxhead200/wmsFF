import { Injectable } from '@nestjs/common';

export type AuditEvent = {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  payload?: Record<string, unknown>;
};

@Injectable()
export class AuditLogService {
  async write(event: AuditEvent) {
    // Русский комментарий: здесь будет запись в Prisma AuditLog; пока оставлен тонкий интерфейс для модулей.
    return {
      ...event,
      createdAt: new Date().toISOString(),
    };
  }
}
