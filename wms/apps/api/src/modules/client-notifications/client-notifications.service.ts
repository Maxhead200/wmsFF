import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { CreateClientNotificationDto } from './dto/create-client-notification.dto';
import { ListClientNotificationsDto } from './dto/list-client-notifications.dto';

@Injectable()
export class ClientNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  list(query: ListClientNotificationsDto, user: AuthUser) {
    const clientId = this.clientScopes.resolveClientFilter(user, query.clientId);

    return this.prisma.clientNotification.findMany({
      where: {
        clientId,
        isRead: query.unreadOnly ? false : undefined,
      },
      include: clientNotificationInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async create(dto: CreateClientNotificationDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');
    await this.ensureRequestBelongsToClient(dto.clientId, dto.requestId);

    // Русский комментарий: уведомление видно клиенту сразу в кабинете, а статус read хранится отдельно от заявки.
    return this.prisma.clientNotification.create({
      data: {
        clientId: dto.clientId,
        requestId: normalizeText(dto.requestId),
        title: dto.title.trim(),
        body: normalizeText(dto.body),
        severity: dto.severity ?? 'INFO',
        createdByUserId: user.id,
      },
      include: clientNotificationInclude,
    });
  }

  async markRead(id: string, user: AuthUser) {
    const notification = await this.prisma.clientNotification.findUnique({
      where: { id },
      select: { id: true, clientId: true, isRead: true },
    });

    if (!notification) {
      throw new NotFoundException('Уведомление не найдено.');
    }

    this.clientScopes.requireClientAccess(user, notification.clientId, 'read');

    if (notification.isRead) {
      return this.prisma.clientNotification.findUniqueOrThrow({
        where: { id },
        include: clientNotificationInclude,
      });
    }

    return this.prisma.clientNotification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
      include: clientNotificationInclude,
    });
  }

  private async ensureRequestBelongsToClient(clientId: string, requestId?: string) {
    if (!requestId) {
      return;
    }

    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      select: { id: true, clientId: true },
    });

    if (!request || request.clientId !== clientId) {
      throw new BadRequestException('Заявка не принадлежит выбранному клиенту.');
    }
  }
}

export const clientNotificationInclude = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  request: {
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.ClientNotificationInclude;

function normalizeText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
