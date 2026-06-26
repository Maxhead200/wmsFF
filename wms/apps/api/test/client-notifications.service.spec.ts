import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { ClientScopeService } from '../src/modules/auth/client-scope.service';
import { ClientNotificationsService } from '../src/modules/client-notifications/client-notifications.service';

describe('ClientNotificationsService', () => {
  it('фильтрует уведомления по доступным клиентам пользователя', async () => {
    const prisma = {
      clientNotification: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ClientNotificationsService(prisma as never, new ClientScopeService());

    await service.list({ unreadOnly: true }, user({ clientIds: ['client-1', 'client-2'] }));

    expect(prisma.clientNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ['client-1', 'client-2'] },
          isRead: false,
        }),
      }),
    );
  });

  it('не создает уведомление для заявки другого клиента', async () => {
    const prisma = {
      clientRequest: {
        findUnique: vi.fn().mockResolvedValue({ id: 'request-1', clientId: 'client-foreign' }),
      },
    };
    const service = new ClientNotificationsService(prisma as never, new ClientScopeService());

    await expect(
      service.create(
        {
          clientId: 'client-1',
          requestId: 'request-1',
          title: 'Документы готовы',
        },
        user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('отмечает уведомление прочитанным в рамках client scope', async () => {
    const prisma = {
      clientNotification: {
        findUnique: vi.fn().mockResolvedValue({ id: 'notification-1', clientId: 'client-1', isRead: false }),
        update: vi.fn().mockResolvedValue({ id: 'notification-1', isRead: true }),
      },
    };
    const service = new ClientNotificationsService(prisma as never, new ClientScopeService());

    await service.markRead('notification-1', user({ clientIds: ['client-1'] }));

    expect(prisma.clientNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'notification-1' },
        data: expect.objectContaining({ isRead: true }),
      }),
    );
  });
});

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'user@example.com',
    name: 'User',
    roleCodes: ['CLIENT'],
    permissionCodes: ['client-notifications:read'],
    clientScopeMode: 'LIMITED',
    clientIds: [],
    writableClientIds: [],
    ...overrides,
  };
}
