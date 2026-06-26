import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { ClientScopeService } from '../src/modules/auth/client-scope.service';
import { ClientRequestFilesService } from '../src/modules/client-requests/client-request-files.service';

describe('ClientRequestFilesService', () => {
  it('сохраняет файл заявки и создает уведомление клиенту', async () => {
    const tx = {
      clientRequestFile: {
        create: vi.fn().mockResolvedValue({
          id: 'file-1',
          requestId: 'request-1',
          clientId: 'client-1',
          fileName: 'invoice.pdf',
          sizeBytes: 4,
        }),
      },
      clientNotification: {
        create: vi.fn().mockResolvedValue({ id: 'notification-1' }),
      },
    };
    const prisma = {
      clientRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'request-1',
          clientId: 'client-1',
          title: 'Отгрузка',
        }),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ClientRequestFilesService(prisma as never, new ClientScopeService());

    await service.uploadToRequest(
      'request-1',
      multerFile({ originalname: 'invoice.pdf', buffer: Buffer.from('test'), size: 4 }),
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(tx.clientRequestFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestId: 'request-1',
          clientId: 'client-1',
          fileName: 'invoice.pdf',
          content: Uint8Array.from(Buffer.from('test')),
        }),
      }),
    );
    expect(tx.clientNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          requestId: 'request-1',
          title: 'Добавлен файл к заявке',
        }),
      }),
    );
  });

  it('не дает загрузить файл в заявку недоступного клиента', async () => {
    const prisma = {
      clientRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'request-1',
          clientId: 'client-foreign',
          title: 'Чужая заявка',
        }),
      },
    };
    const service = new ClientRequestFilesService(prisma as never, new ClientScopeService());

    await expect(
      service.uploadToRequest(
        'request-1',
        multerFile({ originalname: 'box.xlsx', buffer: Buffer.from('test'), size: 4 }),
        user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

function multerFile(overrides: Partial<Express.Multer.File>): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'file.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: 0,
    stream: undefined as never,
    destination: '',
    filename: '',
    path: '',
    buffer: Buffer.alloc(0),
    ...overrides,
  };
}

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleCodes: ['CLIENT'],
    permissionCodes: ['client-requests:read', 'client-requests:write'],
    clientScopeMode: 'LIMITED',
    clientIds: [],
    writableClientIds: [],
    ...overrides,
  };
}
