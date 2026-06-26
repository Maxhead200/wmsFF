import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ClientRequestEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';
import { CreateClientRequestCommentDto } from './dto/create-client-request-comment.dto';

@Injectable()
export class ClientRequestHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  async getTimeline(requestId: string, user: AuthUser) {
    const request = await this.getRequestForAccess(requestId);
    this.clientScopes.requireClientAccess(user, request.clientId, 'read');
    const includeInternal = canSeeInternalComments(user);

    const [comments, events] = await Promise.all([
      this.prisma.clientRequestComment.findMany({
        where: {
          requestId,
          isInternal: includeInternal ? undefined : false,
        },
        include: clientRequestCommentInclude,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.clientRequestEvent.findMany({
        where: { requestId },
        include: clientRequestEventInclude,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      request,
      comments,
      events,
    };
  }

  async addComment(requestId: string, dto: CreateClientRequestCommentDto, user: AuthUser) {
    const request = await this.getRequestForAccess(requestId);
    this.clientScopes.requireClientAccess(user, request.clientId, 'write');

    const isInternal = dto.isInternal === true;
    if (isInternal && !canSeeInternalComments(user)) {
      throw new ForbiddenException('Внутренний комментарий доступен только сотрудникам.');
    }

    const body = dto.body.trim();
    if (!body) {
      throw new BadRequestException('Комментарий не должен быть пустым.');
    }

    // Русский комментарий: комментарий, событие и уведомление пишем одной транзакцией, чтобы история заявки не расходилась с кабинетом клиента.
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.clientRequestComment.create({
        data: {
          requestId,
          clientId: request.clientId,
          authorUserId: user.id,
          body,
          isInternal,
        },
        include: clientRequestCommentInclude,
      });

      await tx.clientRequestEvent.create({
        data: {
          requestId,
          clientId: request.clientId,
          eventType: ClientRequestEventType.COMMENT,
          title: isInternal ? 'Внутренний комментарий' : 'Добавлен комментарий',
          body: isInternal ? undefined : body,
          createdByUserId: user.id,
        },
      });

      if (!isInternal && shouldNotifyClient(user)) {
        await tx.clientNotification.create({
          data: {
            clientId: request.clientId,
            requestId,
            title: 'Новый комментарий по заявке',
            body: `${request.title}: ${body.slice(0, 180)}`,
            severity: 'INFO',
            createdByUserId: user.id,
          },
        });
      }

      return comment;
    });
  }

  private async getRequestForAccess(requestId: string) {
    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        clientId: true,
        title: true,
        type: true,
        status: true,
        createdAt: true,
        client: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Клиентская заявка не найдена.');
    }

    return request;
  }
}

export const clientRequestCommentInclude = {
  author: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.ClientRequestCommentInclude;

export const clientRequestEventInclude = {
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.ClientRequestEventInclude;

function canSeeInternalComments(user: AuthUser) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes('client-requests:status');
}

function shouldNotifyClient(user: AuthUser) {
  return user.permissionCodes.includes('system:admin') || user.permissionCodes.includes('client-requests:status');
}
