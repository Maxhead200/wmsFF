import { BadRequestException } from '@nestjs/common';
import { BillingChargeStatus, BillingUnit } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../src/modules/auth/auth.types';
import { BillingService } from '../src/modules/billing/billing.service';

describe('BillingService', () => {
  it('фильтрует начисления по доступным клиентам пользователя', async () => {
    const prisma = {
      billingCharge: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.listCharges({}, user({ clientIds: ['client-1'] }));

    expect(prisma.billingCharge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: ['client-1'] },
        }),
      }),
    );
  });

  it('создает начисление по услуге и считает сумму', async () => {
    const prisma = {
      billingService: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'service-1',
          name: 'Приемка коробов',
          unit: BillingUnit.BOX,
          defaultPriceRub: '12.50',
        }),
      },
      clientRequest: {
        findFirst: vi.fn().mockResolvedValue({ id: 'request-1' }),
      },
      billingCharge: {
        create: vi.fn().mockResolvedValue({ id: 'charge-1' }),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.createCharge(
      {
        clientId: 'client-1',
        serviceId: 'service-1',
        requestId: 'request-1',
        quantity: 4,
      },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(prisma.billingCharge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: 'client-1',
          description: 'Приемка коробов',
          unit: BillingUnit.BOX,
          unitPriceRub: 12.5,
          totalRub: 50,
          createdByUserId: 'user-1',
        }),
      }),
    );
  });

  it('запрещает привязать начисление к заявке другого клиента', async () => {
    const prisma = {
      billingService: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      clientRequest: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await expect(
      service.createCharge(
        {
          clientId: 'client-1',
          requestId: 'foreign-request',
          description: 'Ручная услуга',
          quantity: 1,
          unitPriceRub: 100,
        },
        user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('утверждает начисление и фиксирует ответственного', async () => {
    const prisma = {
      billingCharge: {
        findUnique: vi.fn().mockResolvedValue({ id: 'charge-1', clientId: 'client-1' }),
        update: vi.fn().mockResolvedValue({ id: 'charge-1', status: BillingChargeStatus.APPROVED }),
      },
    };
    const service = new BillingService(prisma as never, clientScopes());

    await service.updateChargeStatus(
      'charge-1',
      { status: BillingChargeStatus.APPROVED },
      user({ clientIds: ['client-1'], writableClientIds: ['client-1'] }),
    );

    expect(prisma.billingCharge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: BillingChargeStatus.APPROVED,
          approvedByUserId: 'user-1',
          approvedAt: expect.any(Date),
        }),
      }),
    );
  });
});

function clientScopes() {
  return {
    resolveClientFilter: (user: AuthUser, requestedClientId?: string) =>
      requestedClientId ?? (user.clientScopeMode === 'ALL' ? undefined : { in: user.clientIds }),
    requireClientAccess: vi.fn(),
    requireGlobalClientAccess: vi.fn(),
  } as never;
}

function user(overrides: Partial<AuthUser>): AuthUser {
  return {
    id: 'user-1',
    email: 'manager@example.com',
    name: 'Manager',
    roleCodes: ['MANAGER'],
    permissionCodes: ['billing:read', 'billing:write'],
    clientScopeMode: 'LIMITED',
    clientIds: [],
    writableClientIds: [],
    ...overrides,
  };
}
