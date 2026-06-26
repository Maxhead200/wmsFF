import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { ClientScopeService } from '../auth/client-scope.service';

const maxFileSizeBytes = 10 * 1024 * 1024;

@Injectable()
export class ClientRequestFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clientScopes: ClientScopeService,
  ) {}

  async listForRequest(requestId: string, user: AuthUser) {
    const request = await this.getRequestForAccess(requestId);
    this.clientScopes.requireClientAccess(user, request.clientId, 'read');

    return this.prisma.clientRequestFile.findMany({
      where: { requestId },
      select: clientRequestFileSummarySelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadToRequest(requestId: string, file: Express.Multer.File | undefined, user: AuthUser) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Файл не передан.');
    }

    if (file.size > maxFileSizeBytes) {
      throw new BadRequestException('Файл больше 10 МБ.');
    }

    const request = await this.getRequestForAccess(requestId);
    this.clientScopes.requireClientAccess(user, request.clientId, 'write');

    // Русский комментарий: файл хранится рядом с заявкой, чтобы клиент видел вложения без внешнего файлового сервиса.
    return this.prisma.$transaction(async (tx) => {
      const savedFile = await tx.clientRequestFile.create({
        data: {
          requestId,
          clientId: request.clientId,
          fileName: normalizeFileName(file.originalname),
          mimeType: file.mimetype || 'application/octet-stream',
          sizeBytes: file.size,
          content: Uint8Array.from(file.buffer),
          uploadedByUserId: user.id,
        },
        select: clientRequestFileSummarySelect,
      });

      await tx.clientNotification.create({
        data: {
          clientId: request.clientId,
          requestId,
          title: 'Добавлен файл к заявке',
          body: `${savedFile.fileName} · ${request.title}`,
          severity: 'INFO',
          createdByUserId: user.id,
        },
      });

      return savedFile;
    });
  }

  async getFileContent(requestId: string, fileId: string, user: AuthUser) {
    const file = await this.prisma.clientRequestFile.findFirst({
      where: { id: fileId, requestId },
      select: {
        ...clientRequestFileSummarySelect,
        content: true,
      },
    });

    if (!file) {
      throw new NotFoundException('Файл заявки не найден.');
    }

    this.clientScopes.requireClientAccess(user, file.clientId, 'read');
    return file;
  }

  private async getRequestForAccess(requestId: string) {
    const request = await this.prisma.clientRequest.findUnique({
      where: { id: requestId },
      select: { id: true, clientId: true, title: true },
    });

    if (!request) {
      throw new NotFoundException('Клиентская заявка не найдена.');
    }

    return request;
  }
}

export const clientRequestFileSummarySelect = {
  id: true,
  requestId: true,
  clientId: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedByUserId: true,
  createdAt: true,
  uploadedBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.ClientRequestFileSelect;

function normalizeFileName(value?: string) {
  const normalized = value?.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return normalized || 'attachment.bin';
}
