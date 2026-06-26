import { BadRequestException } from '@nestjs/common';
import { ClientNotificationEvent } from '@prisma/client';
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
  it('returns default notification preferences for a scoped client', async () => {
    const prisma = {
      client: {
        findMany: vi.fn().mockResolvedValue([{ id: 'client-1', code: 'CLIENT', name: 'Client' }]),
      },
      clientNotificationPreference: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ClientNotificationsService(prisma as never, new ClientScopeService());

    const preferences = await service.listPreferences(
      { clientId: 'client-1' },
      user({ clientIds: ['client-1'] }),
    );

    expect(preferences).toHaveLength(4);
    expect(preferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientId: 'client-1',
          eventType: ClientNotificationEvent.REQUEST_COMMENT,
          isEnabled: true,
        }),
      ]),
    );
  });

  it('saves a notification preference for a scoped client', async () => {
    const prisma = {
      client: {
        findUnique: vi.fn().mockResolvedValue({ id: 'client-1' }),
      },
      clientNotificationPreference: {
        upsert: vi.fn().mockResolvedValue({
          id: 'preference-1',
          clientId: 'client-1',
          eventType: ClientNotificationEvent.REQUEST_FILE_UPLOADED,
          isEnabled: false,
        }),
      },
    };
    const service = new ClientNotificationsService(prisma as never, new ClientScopeService());

    await service.updatePreference(
      {
        clientId: 'client-1',
        eventType: ClientNotificationEvent.REQUEST_FILE_UPLOADED,
        isEnabled: false,
      },
      user({ clientIds: ['client-1'] }),
    );

    expect(prisma.clientNotificationPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId_eventType: {
            clientId: 'client-1',
            eventType: ClientNotificationEvent.REQUEST_FILE_UPLOADED,
          },
        },
        update: expect.objectContaining({ isEnabled: false, updatedByUserId: 'user-1' }),
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
