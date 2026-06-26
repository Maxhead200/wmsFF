import { BadRequestException } from '@nestjs/common';
import { ClientRequestEventType, ClientRequestPriority, ClientRequestStatus, ClientRequestType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { ClientScopeService } from '../src/modules/auth/client-scope.service';
import { ClientRequestsService } from '../src/modules/client-requests/client-requests.service';

describe('ClientRequestsService', () => {
  it('фильтрует список заявок по доступным клиентам пользователя', async () => {
    const prisma = {
      clientRequest: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ClientRequestsService(prisma as never, new ClientScopeService());

    await service.list({}, user({ clientIds: ['client-1', 'client-2'] }));

    expect(prisma.clientRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ['client-1', 'client-2'] },
        }),
      }),
    );
  });

  it('создает заявку в статусе SUBMITTED и привязывает автора', async () => {
    const tx = {
      clientRequest: {
        create: vi.fn().mockResolvedValue({ id: 'request-1', clientId: 'client-1', comment: null }),
      },
      clientRequestEvent: {
        create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      },
    };
    const prisma = {
      sku: {
        findMany: vi.fn().mockResolvedValue([{ id: 'sku-1' }]),
      },
      $transaction: vi.fn((callback) => callback(tx)),
    };
    const service = new ClientRequestsService(prisma as never, new ClientScopeService());

    await service.create(
      {
        clientId: 'client-1',
        type: ClientRequestType.OUTBOUND,
        priority: ClientRequestPriority.HIGH,
        title: 'Отгрузка на маркетплейс',
        items: [{ skuId: 'sku-1', quantity: 3 }],
      },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(tx.clientRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          status: ClientRequestStatus.SUBMITTED,
          createdByUserId: 'user-1',
        }),
      }),
    );
    expect(tx.clientRequestEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestId: 'request-1',
          eventType: ClientRequestEventType.CREATED,
          statusTo: ClientRequestStatus.SUBMITTED,
        }),
      }),
    );
  });

  it('запрещает добавить в заявку SKU другого клиента', async () => {
    const prisma = {
      sku: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ClientRequestsService(prisma as never, new ClientScopeService());

    await expect(
      service.create(
        {
          clientId: 'client-1',
          type: ClientRequestType.OUTBOUND,
          title: 'Чужая SKU',
          items: [{ skuId: 'sku-foreign', quantity: 1 }],
        },
        user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

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
