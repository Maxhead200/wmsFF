import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEvent = {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  payload?: Record<string, unknown>;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  write(event: AuditEvent) {
    return this.prisma.auditLog.create({
      data: {
        userId: event.userId,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId,
        payload: event.payload as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
