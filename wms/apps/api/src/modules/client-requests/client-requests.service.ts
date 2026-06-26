import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientNotificationEvent, ClientRequestEventType, ClientRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { isClientNotificationEnabled } from '../client-notifications/client-notification-preferences';
import { clientRequestFileSummarySelect } from './client-request-files.service';
import { CreateClientRequestDto } from './dto/create-client-request.dto';
import { ListClientRequestsDto } from './dto/list-client-requests.dto';
import { UpdateClientRequestStatusDto } from './dto/update-client-request-status.dto';

@Injectable()
export class ClientRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  list(query: ListClientRequestsDto, user: AuthUser) {
    const where: Prisma.ClientRequestWhereInput = {
      clientId: this.clientScopes.resolveClientFilter(user, query.clientId),
      status: query.status,
      type: query.type,
    };

    return this.prisma.clientRequest.findMany({
      where,
      include: clientRequestInclude,
      orderBy: [{ updatedAt: 'desc' }],
      take: 200,
    });
  }

  async get(id: string, user: AuthUser) {
    const request = await this.prisma.clientRequest.findUnique({
      where: { id },
      include: clientRequestInclude,
    });

    if (!request) {
      throw new NotFoundException('Клиентская заявка не найдена.');
    }

    this.clientScopes.requireClientAccess(user, request.clientId, 'read');
    return request;
  }

  async create(dto: CreateClientRequestDto, user: AuthUser) {
    this.clientScopes.requireClientAccess(user, dto.clientId, 'write');
    await this.ensureSkuItemsBelongToClient(dto.clientId, dto.items ?? []);

    // Русский комментарий: клиентская заявка всегда стартует как SUBMITTED; статусы меняет отдельный workflow.
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.clientRequest.create({
        data: {
          clientId: dto.clientId,
          type: dto.type,
          status: ClientRequestStatus.SUBMITTED,
          priority: dto.priority ?? 'NORMAL',
          title: dto.title.trim(),
          comment: normalizeText(dto.comment),
          contactName: normalizeText(dto.contactName),
          contactPhone: normalizeText(dto.contactPhone),
          deliveryAddress: normalizeText(dto.deliveryAddress),
          desiredDate: dto.desiredDate ? new Date(dto.desiredDate) : undefined,
          createdByUserId: user.id,
          items: dto.items?.length
            ? {
                create: dto.items.map((item) => ({
                  skuId: normalizeText(item.skuId),
                  barcode: normalizeText(item.barcode),
                  name: normalizeText(item.name),
                  quantity: item.quantity,
                  comment: normalizeText(item.comment),
                })),
              }
            : undefined,
        },
        include: clientRequestInclude,
      });

      await tx.clientRequestEvent.create({
        data: {
          requestId: request.id,
          clientId: request.clientId,
          eventType: ClientRequestEventType.CREATED,
          title: 'Заявка создана',
          body: request.comment ?? undefined,
          statusTo: ClientRequestStatus.SUBMITTED,
          createdByUserId: user.id,
        },
      });

      return request;
    });
  }

  async updateStatus(id: string, dto: UpdateClientRequestStatusDto, user: AuthUser) {
    const request = await this.prisma.clientRequest.findUnique({
      where: { id },
      select: { id: true, clientId: true, status: true, title: true },
    });

    if (!request) {
      throw new NotFoundException('Клиентская заявка не найдена.');
    }

    // Русский комментарий: даже менеджер с ограниченным scope не меняет статусы чужого клиента.
    this.clientScopes.requireClientAccess(user, request.clientId, 'write');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clientRequest.update({
        where: { id },
        data: {
          status: dto.status,
          managerComment: normalizeText(dto.managerComment),
          assignedToUserId: dto.status === ClientRequestStatus.IN_WORK ? user.id : undefined,
        },
        include: clientRequestInclude,
      });

      if (request.status !== dto.status) {
        await tx.clientRequestEvent.create({
          data: {
            requestId: id,
            clientId: request.clientId,
            eventType: ClientRequestEventType.STATUS_CHANGED,
            title: 'Статус заявки изменен',
            body: normalizeText(dto.managerComment),
            statusFrom: request.status,
            statusTo: dto.status,
            createdByUserId: user.id,
          },
        });

        if (await isClientNotificationEnabled(tx, request.clientId, ClientNotificationEvent.REQUEST_STATUS_CHANGED)) {
          await tx.clientNotification.create({
            data: {
              clientId: request.clientId,
              requestId: id,
              title: 'Статус заявки изменен',
              body: `${request.title}: ${request.status} -> ${dto.status}`,
              severity: 'INFO',
              createdByUserId: user.id,
            },
          });
        }
      }

      return updated;
    });
  }

  private async ensureSkuItemsBelongToClient(clientId: string, items: Array<{ skuId?: string }>) {
    const skuIds = [...new Set(items.map((item) => item.skuId).filter(Boolean))] as string[];
    if (skuIds.length === 0) {
      return;
    }

    const foundSkus = await this.prisma.sku.findMany({
      where: {
        id: { in: skuIds },
        clientId,
      },
      select: { id: true },
    });

    if (foundSkus.length !== skuIds.length) {
      throw new BadRequestException('Одна или несколько SKU в заявке не принадлежат выбранному клиенту.');
    }
  }
}

const clientRequestInclude = {
  client: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  items: {
    include: {
      sku: {
        select: {
          id: true,
          internalSku: true,
          name: true,
        },
      },
    },
    orderBy: {
      id: 'asc',
    },
  },
  files: {
    select: clientRequestFileSummarySelect,
    orderBy: {
      createdAt: 'desc',
    },
  },
} satisfies Prisma.ClientRequestInclude;

function normalizeText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
